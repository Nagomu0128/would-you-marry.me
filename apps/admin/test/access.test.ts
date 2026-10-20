import { env } from 'cloudflare:workers'
import { createVisitorSession, getActiveCoupleAccess, getActiveJoinToken } from '@wym/db'
import { getPhaseBoundaries, verifyPasscode } from '@wym/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { auditRows, newGuest, newTenant } from './fixtures'
import { ADMIN_EMAIL, adminRequest, db, resetStorage } from './helpers'

beforeEach(resetStorage)

const GUEST_ORIGIN = env.GUEST_ORIGIN

type JoinBody = {
  url: string | null
  issuedAt?: string
  joiningStart?: string
  joiningEnd?: string
}
type CoupleBody = {
  url: string | null
  passcode?: string
  issuedAt?: string
  termsAgreedAt?: string | null
}

describe('参加 URL', () => {
  it('未発行なら GET は { url: null }', async () => {
    const t = await newTenant()
    const res = await adminRequest(`/api/tenants/${t.id}/join-url`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: null })
  })

  it('POST で発行し、GET で同じ URL が返る。期間は閲覧期間の開始を含まない境界', async () => {
    const t = await newTenant('2026-10-31')
    const res = await adminRequest(`/api/tenants/${t.id}/join-url`, { method: 'POST' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as JoinBody
    expect(body.url).toMatch(
      new RegExp(`^${GUEST_ORIGIN}/join/${t.id}\\?t=[A-Za-z0-9_-]{43}$`.replaceAll('/', '\\/')),
    )
    const b = getPhaseBoundaries('2026-10-31')
    expect(body.joiningStart).toBe(b.joiningStart.toISOString())
    expect(body.joiningEnd).toBe(b.viewingStart.toISOString())
    expect(new Date(body.issuedAt ?? '').toISOString()).toBe(body.issuedAt)

    const again = (await (await adminRequest(`/api/tenants/${t.id}/join-url`)).json()) as JoinBody
    expect(again).toEqual(body)

    const logs = await auditRows(t.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ actor: ADMIN_EMAIL, action: 'join_url.issue', detail: null })
  })

  it('再発行で古いトークンは無効になり、参加者のセッションは残る', async () => {
    const t = await newTenant()
    const guest = await newGuest(t.id, 'taro')
    await createVisitorSession(db, {
      tenantId: t.id,
      kind: 'guest',
      guestId: guest.id,
      idHash: 'hash-1',
    })
    const first = (await (
      await adminRequest(`/api/tenants/${t.id}/join-url`, { method: 'POST' })
    ).json()) as JoinBody
    const second = (await (
      await adminRequest(`/api/tenants/${t.id}/join-url`, { method: 'POST' })
    ).json()) as JoinBody
    expect(second.url).not.toBe(first.url)

    const oldToken = new URL(first.url ?? '').searchParams.get('t') ?? ''
    const newToken = new URL(second.url ?? '').searchParams.get('t') ?? ''
    expect((await getActiveJoinToken(db, t.id))?.token).toBe(newToken)
    const old = await env.DB.prepare('SELECT revoked_at FROM join_tokens WHERE token = ?')
      .bind(oldToken)
      .first<{ revoked_at: number | null }>()
    expect(old?.revoked_at).not.toBeNull()

    const sessions = await env.DB.prepare('SELECT COUNT(*) AS n FROM visitor_sessions').first<{
      n: number
    }>()
    expect(sessions?.n).toBe(1)
    expect((await auditRows(t.id)).map((r) => r.action)).toEqual([
      'join_url.issue',
      'join_url.issue',
    ])
  })
})

describe('新郎新婦用 URL', () => {
  it('未発行なら GET は { url: null }', async () => {
    const t = await newTenant()
    const res = await adminRequest(`/api/tenants/${t.id}/couple-access`)
    expect(await res.json()).toEqual({ url: null })
  })

  it('発行でパスコードが返り、ハッシュが保存され、GET では返らない', async () => {
    const t = await newTenant()
    const res = await adminRequest(`/api/tenants/${t.id}/couple-access`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = (await res.json()) as CoupleBody
    expect(body.passcode).toMatch(/^[A-Z2-9]{8}$/)
    expect(body.url).toMatch(
      new RegExp(`^${GUEST_ORIGIN}/couple/${t.id}\\?t=[A-Za-z0-9_-]{43}$`.replaceAll('/', '\\/')),
    )

    const stored = await getActiveCoupleAccess(db, t.id)
    expect(stored?.passcodeHash).not.toContain(body.passcode ?? '')
    expect(stored?.passcodeHash.startsWith('pbkdf2-sha256$')).toBe(true)
    expect(await verifyPasscode(body.passcode ?? '', stored?.passcodeHash ?? '')).toBe(true)

    const get = await adminRequest(`/api/tenants/${t.id}/couple-access`)
    const got = (await get.json()) as CoupleBody
    expect(got.url).toBe(body.url)
    expect(got.issuedAt).toBe(body.issuedAt)
    expect(got.termsAgreedAt).toBeNull()
    expect(got).not.toHaveProperty('passcode')
    expect(JSON.stringify(got)).not.toContain(body.passcode ?? '')
  })

  it('再発行で古いトークンとセッションが無効になる。監査ログにパスコード・トークンが入らない', async () => {
    const t = await newTenant()
    const first = (await (
      await adminRequest(`/api/tenants/${t.id}/couple-access`, { method: 'POST' })
    ).json()) as CoupleBody
    const firstAccess = await getActiveCoupleAccess(db, t.id)
    if (!firstAccess) throw new Error('not issued')
    await createVisitorSession(db, {
      tenantId: t.id,
      kind: 'couple',
      coupleAccessId: firstAccess.id,
      idHash: 'couple-session',
    })
    const guest = await newGuest(t.id, 'taro')
    await createVisitorSession(db, {
      tenantId: t.id,
      kind: 'guest',
      guestId: guest.id,
      idHash: 'guest-session',
    })

    const second = (await (
      await adminRequest(`/api/tenants/${t.id}/couple-access`, { method: 'POST' })
    ).json()) as CoupleBody
    expect(second.url).not.toBe(first.url)
    expect(second.passcode).not.toBe(first.passcode)

    const old = await env.DB.prepare('SELECT revoked_at FROM couple_accesses WHERE id = ?')
      .bind(firstAccess.id)
      .first<{ revoked_at: number | null }>()
    expect(old?.revoked_at).not.toBeNull()
    const sessions = await env.DB.prepare('SELECT id_hash, kind FROM visitor_sessions').all()
    expect(sessions.results).toEqual([{ id_hash: 'guest-session', kind: 'guest' }])

    const logs = await auditRows(t.id)
    expect(logs.map((l) => l.action)).toEqual(['couple_access.issue', 'couple_access.issue'])
    const dump = JSON.stringify(logs)
    for (const secret of [first, second]) {
      expect(dump).not.toContain(secret.passcode ?? '')
      expect(dump).not.toContain(new URL(secret.url ?? '').searchParams.get('t') ?? '')
    }
  })
})
