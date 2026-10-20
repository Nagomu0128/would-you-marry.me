import { createExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { sha256Hex } from '@wym/shared'
import { describe, expect, it } from 'vitest'
import { app } from '../src/worker/app'
import {
  EVENT,
  makeGuestSession,
  makeJoinToken,
  makeTenant,
  ORIGIN,
  parseSetCookie,
  request,
} from './helpers'

async function countGuests(tenantId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM guests WHERE tenant_id = ?')
    .bind(tenantId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

function join(tenantId: string, token: string | null, cookie?: string) {
  const query = token === null ? '' : `?t=${token}`
  return request(`/join/${tenantId}${query}`, {
    cookie,
    headers: { 'CF-Connecting-IP': '203.0.113.1' },
  })
}

describe('GET /join/:tenantId', () => {
  it('成功すると Cookie を設定し、トークンのない URL のニックネーム登録へリダイレクトする', async () => {
    const tenant = await makeTenant(EVENT.joining)
    const token = await makeJoinToken(tenant.id)

    const res = await join(tenant.id, token)

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`/t/${tenant.id}/nickname`)
    expect(res.headers.get('location')).not.toContain(token)
    expect(res.headers.get('cache-control')).toBe('no-store')

    const cookie = parseSetCookie(res)
    expect(cookie.name).toBe(`wym_g_${tenant.id}`)
    expect(cookie.value.length).toBeGreaterThanOrEqual(43) // 32 バイトの base64url
    expect(cookie.attrs).toContain('HttpOnly')
    expect(cookie.attrs).toContain('Secure')
    expect(cookie.attrs).toContain('SameSite=Lax')
    expect(cookie.attrs).toContain('Path=/')
    expect(cookie.attrs).toContain(`Max-Age=${400 * 24 * 60 * 60}`)
    expect(cookie.attrs.some((a) => a.toLowerCase().startsWith('domain'))).toBe(false)
    expect(res.headers.get('set-cookie')).not.toContain(token)
  })

  it('D1 にはセッション ID のハッシュだけが入る', async () => {
    const tenant = await makeTenant(EVENT.joining)
    const token = await makeJoinToken(tenant.id)

    const res = await join(tenant.id, token)
    const { value: sessionId } = parseSetCookie(res)

    const rows = await env.DB.prepare('SELECT * FROM visitor_sessions WHERE tenant_id = ?')
      .bind(tenant.id)
      .all<Record<string, unknown>>()
    expect(rows.results).toHaveLength(1)
    const row = rows.results[0]
    expect(row?.id_hash).toBe(await sha256Hex(sessionId))
    expect(row?.kind).toBe('guest')
    // どの列にも平文のセッション ID は入っていない
    expect(Object.values(row ?? {})).not.toContain(sessionId)
    expect(await countGuests(tenant.id)).toBe(1)
  })

  it('作られた参加者のセッションで /me が使え、ニックネームは未登録', async () => {
    const tenant = await makeTenant(EVENT.joining)
    const token = await makeJoinToken(tenant.id)
    const res = await join(tenant.id, token)
    const { name, value } = parseSetCookie(res)

    const me = await request(`/api/t/${tenant.id}/me`, { cookie: `${name}=${value}` })
    expect(me.status).toBe(200)
    const body = await me.json<{ me: { nickname: string | null } }>()
    expect(body.me.nickname).toBeNull()
  })

  it('2 回目の参加では参加者が増えず、状態に応じたページへ進む', async () => {
    const tenant = await makeTenant(EVENT.joining)
    const token = await makeJoinToken(tenant.id)
    const first = await join(tenant.id, token)
    const { name, value } = parseSetCookie(first)
    const cookie = `${name}=${value}`

    const second = await join(tenant.id, token, cookie)
    expect(second.status).toBe(302)
    expect(second.headers.get('location')).toBe(`/t/${tenant.id}/nickname`)
    expect(second.headers.get('set-cookie')).toBeNull()
    expect(await countGuests(tenant.id)).toBe(1)

    // ニックネーム登録済みならホームへ
    const registered = await request(`/api/t/${tenant.id}/me/nickname`, {
      method: 'PUT',
      cookie,
      json: { nickname: 'たろう', agreeToTerms: true },
    })
    expect(registered.status).toBe(200)
    const third = await join(tenant.id, token, cookie)
    expect(third.headers.get('location')).toBe(`/t/${tenant.id}`)
    expect(await countGuests(tenant.id)).toBe(1)
  })

  it('参加受付期間が過ぎていても、トークンなしで既存のセッションなら遷移できる（新規は作らない）', async () => {
    const tenant = await makeTenant(EVENT.viewing)
    const { cookie } = await makeGuestSession(tenant.id, 'はなこ')
    const res = await join(tenant.id, null, cookie)
    expect(res.headers.get('location')).toBe(`/t/${tenant.id}`)
  })

  describe('エラーは /error?code=... へリダイレクトする', () => {
    async function expectError(res: Response, code: string) {
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe(`/error?code=${code}`)
      expect(res.headers.get('set-cookie')).toBeNull()
    }

    it('参加受付期間より前（準備期間）', async () => {
      const tenant = await makeTenant(EVENT.preparation)
      const token = await makeJoinToken(tenant.id)
      await expectError(await join(tenant.id, token), 'OUTSIDE_JOINING_PERIOD')
      expect(await countGuests(tenant.id)).toBe(0)
    })

    it('参加受付期間より後（閲覧期間）', async () => {
      const tenant = await makeTenant(EVENT.viewing)
      const token = await makeJoinToken(tenant.id)
      await expectError(await join(tenant.id, token), 'OUTSIDE_JOINING_PERIOD')
      expect(await countGuests(tenant.id)).toBe(0)
    })

    it('停止中', async () => {
      const tenant = await makeTenant(EVENT.joining, { suspended: true })
      const token = await makeJoinToken(tenant.id)
      await expectError(await join(tenant.id, token), 'TENANT_SUSPENDED')
    })

    it('無効なトークン・トークンなし', async () => {
      const tenant = await makeTenant(EVENT.joining)
      await makeJoinToken(tenant.id)
      await expectError(await join(tenant.id, 'wrong-token'), 'JOIN_TOKEN_INVALID')
      await expectError(await join(tenant.id, null), 'JOIN_TOKEN_INVALID')
      expect(await countGuests(tenant.id)).toBe(0)
    })

    it('再発行で無効になった古いトークン', async () => {
      const tenant = await makeTenant(EVENT.joining)
      const oldToken = await makeJoinToken(tenant.id)
      const newToken = await makeJoinToken(tenant.id)
      await expectError(await join(tenant.id, oldToken), 'JOIN_TOKEN_INVALID')
      expect((await join(tenant.id, newToken)).headers.get('location')).toBe(
        `/t/${tenant.id}/nickname`,
      )
    })

    it('存在しないテナント', async () => {
      await expectError(
        await join('00000000-0000-4000-8000-000000000000', 'token'),
        'TENANT_NOT_FOUND',
      )
    })

    it('UUID でないテナント ID', async () => {
      await expectError(await join('not-a-uuid', 'token'), 'TENANT_NOT_FOUND')
      await expectError(await join('..%2Fsecret', 'token'), 'TENANT_NOT_FOUND')
    })

    it('データ削除済みのテナント', async () => {
      const tenant = await makeTenant(EVENT.joining)
      const token = await makeJoinToken(tenant.id)
      await env.DB.prepare('UPDATE tenants SET data_deleted_at = ? WHERE id = ?')
        .bind(Date.now(), tenant.id)
        .run()
      await expectError(await join(tenant.id, token), 'TENANT_NOT_FOUND')
    })

    it('テナント A のトークンでテナント B の参加 URL から参加できない', async () => {
      const tenantA = await makeTenant(EVENT.joining)
      const tenantB = await makeTenant(EVENT.joining)
      const tokenA = await makeJoinToken(tenantA.id)
      await makeJoinToken(tenantB.id)
      await expectError(await join(tenantB.id, tokenA), 'JOIN_TOKEN_INVALID')
      expect(await countGuests(tenantB.id)).toBe(0)
    })
  })

  describe('レート制限（D-38）', () => {
    it('Workers の Rate Limiting バインディングが設定されている', () => {
      expect(typeof env.JOIN_RATE_LIMITER.limit).toBe('function')
    })

    it('制限を超えると /error?code=RATE_LIMITED へリダイレクトする', async () => {
      const tenant = await makeTenant(EVENT.joining)
      const token = await makeJoinToken(tenant.id)
      const keys: string[] = []
      const limited = {
        ...env,
        JOIN_RATE_LIMITER: {
          limit: async ({ key }: { key: string }) => {
            keys.push(key)
            return { success: false }
          },
        },
      }
      const res = await app.fetch(
        new Request(`${ORIGIN}/join/${tenant.id}?t=${token}`, {
          headers: { 'CF-Connecting-IP': '198.51.100.7' },
        }),
        limited,
        createExecutionContext(),
      )
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('/error?code=RATE_LIMITED')
      expect(keys).toEqual(['198.51.100.7'])
      expect(await countGuests(tenant.id)).toBe(0)
    })

    it('バインディングがないときは制限しない', async () => {
      const tenant = await makeTenant(EVENT.joining)
      const token = await makeJoinToken(tenant.id)
      const { JOIN_RATE_LIMITER: _removed, ...withoutLimiter } = env
      const res = await app.fetch(
        new Request(`${ORIGIN}/join/${tenant.id}?t=${token}`),
        withoutLimiter as typeof env,
        createExecutionContext(),
      )
      expect(res.headers.get('location')).toBe(`/t/${tenant.id}/nickname`)
    })

    it('実際のバインディングで、同じ IP から 200 回までは通り、超えると制限される', async () => {
      const ip = { 'CF-Connecting-IP': '192.0.2.200' }
      const missing = '/join/not-a-uuid'
      // Rate Limiting は 60 秒の窓で数える。テスト中に窓の境目をまたぐと数が 0 に戻るため、
      // 「ちょうど 205 回目までに制限される」とは言えない。そこで制限されるまで送り続け、
      // 境目を 1 回またいでも必ず制限に達する回数（200 回 x 3 窓分）を上限にする。
      // 確かめること: (1) 最初の 200 回は必ず通る (2) いずれ制限される
      const MAX_REQUESTS = 600
      let limitedAt = -1
      for (let i = 1; i <= MAX_REQUESTS; i++) {
        const res = await request(missing, { headers: ip })
        if (res.headers.get('location') === '/error?code=RATE_LIMITED') {
          limitedAt = i
          break
        }
      }
      expect(limitedAt).toBeGreaterThan(0)
      expect(limitedAt).toBeGreaterThanOrEqual(201)
      // 別の IP は影響を受けない
      const other = await request(missing, { headers: { 'CF-Connecting-IP': '192.0.2.201' } })
      expect(other.headers.get('location')).toBe('/error?code=TENANT_NOT_FOUND')
    })
  })
})
