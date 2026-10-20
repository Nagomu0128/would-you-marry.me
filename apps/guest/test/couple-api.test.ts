import { env } from 'cloudflare:workers'
import {
  insertPhotoWithLimit,
  issueCoupleAccess,
  likePhoto,
  newId,
  photoKeys,
  type Tenant,
} from '@wym/db'
import {
  type CoupleLoginStateResponse,
  type CoupleMeResponse,
  type CouplePhotoListResponse,
  type CoupleRankingResponse,
  type GuestRankingResponse,
  hashPasscode,
  sha256Hex,
  type UploadersResponse,
} from '@wym/shared'
import { describe, expect, it } from 'vitest'
import { buildJpeg, buildPng } from '../src/worker/lib/image-fixtures'
import {
  db,
  EVENT,
  errorCode,
  makeCoupleAccess,
  makeCoupleSession,
  makeGuestSession,
  makeTenant,
  PASSCODE,
  request,
} from './helpers'

// ------------------------------------------------------------ 道具

const loginPath = (tenantId: string) => `/api/couple/${tenantId}/login`

const login = (tenantId: string, pending: string | undefined, json: unknown) =>
  request(loginPath(tenantId), {
    method: 'POST',
    cookie: pending ? `wym_couple_pending=${pending}` : undefined,
    json,
  })

async function setupLogin(eventDays: number = EVENT.joining) {
  const tenant = await makeTenant(eventDays)
  const { token, access } = await makeCoupleAccess(tenant.id)
  return { tenant, token, access }
}

async function setupSession() {
  const tenant = await makeTenant()
  const { access, token } = await makeCoupleAccess(tenant.id)
  const { cookie } = await makeCoupleSession(tenant.id, access.id)
  return { tenant, access, token, cookie }
}

async function accessRow(id: string) {
  return env.DB.prepare(
    'SELECT failed_attempts, locked_until, terms_agreed_at FROM couple_accesses WHERE id = ?',
  )
    .bind(id)
    .first<{
      failed_attempts: number
      locked_until: number | null
      terms_agreed_at: number | null
    }>()
}

async function seedPhoto(tenantId: string, guestId: string, createdAt = Date.now(), png = false) {
  const id = newId()
  const contentType = png ? 'image/png' : 'image/jpeg'
  const keys = photoKeys(tenantId, id, contentType)
  await env.BUCKET.put(keys.original, png ? buildPng().bytes : buildJpeg().bytes, {
    httpMetadata: { contentType },
  })
  await env.BUCKET.put(keys.display, new Uint8Array([0xff, 0xd8, 0xff, 1]), {
    httpMetadata: { contentType: 'image/jpeg' },
  })
  await env.BUCKET.put(keys.thumb, new Uint8Array([0xff, 0xd8, 0xff, 2]), {
    httpMetadata: { contentType: 'image/jpeg' },
  })
  const result = await insertPhotoWithLimit(
    db,
    tenantId,
    {
      id,
      guestId,
      originalKey: keys.original,
      displayKey: keys.display,
      thumbKey: keys.thumb,
      originalContentType: contentType,
      storedSizeBytes: 100,
      width: 800,
      height: 600,
    },
    100,
    createdAt,
  )
  if (!result.inserted) throw new Error('seed failed')
  return id
}

// ------------------------------------------------------------ 入場

describe('GET /api/couple/:tenantId/login', () => {
  it('テナント名と、規約への同意が必要かを返す', async () => {
    const { tenant, token } = await setupLogin()
    const res = await request(loginPath(tenant.id), { cookie: `wym_couple_pending=${token}` })
    expect(res.status).toBe(200)
    const body: CoupleLoginStateResponse = await res.json()
    expect(body).toEqual({ tenantName: tenant.name, needsTermsAgreement: true })
  })

  it('pending Cookie がない・別のトークンなら COUPLE_LINK_INVALID', async () => {
    const { tenant } = await setupLogin()
    const none = await request(loginPath(tenant.id))
    expect(none.status).toBe(403)
    expect(await errorCode(none)).toBe('COUPLE_LINK_INVALID')
    const wrong = await request(loginPath(tenant.id), { cookie: 'wym_couple_pending=nope' })
    expect(await errorCode(wrong)).toBe('COUPLE_LINK_INVALID')
  })

  it('再発行で古いトークンは使えない', async () => {
    const { tenant, token } = await setupLogin()
    await makeCoupleAccess(tenant.id)
    const res = await request(loginPath(tenant.id), { cookie: `wym_couple_pending=${token}` })
    expect(await errorCode(res)).toBe('COUPLE_LINK_INVALID')
  })

  it('停止中・期間外・存在しない・削除済み', async () => {
    const suspended = await makeTenant(EVENT.joining, { suspended: true })
    const s = await makeCoupleAccess(suspended.id)
    expect(
      await errorCode(
        await request(loginPath(suspended.id), { cookie: `wym_couple_pending=${s.token}` }),
      ),
    ).toBe('TENANT_SUSPENDED')

    const expired = await makeTenant(EVENT.expired)
    const e = await makeCoupleAccess(expired.id)
    expect(
      await errorCode(
        await request(loginPath(expired.id), { cookie: `wym_couple_pending=${e.token}` }),
      ),
    ).toBe('PERIOD_ENDED')

    expect(await errorCode(await request(loginPath(newId())))).toBe('TENANT_NOT_FOUND')
    expect(await errorCode(await request(loginPath('not-a-uuid')))).toBe('TENANT_NOT_FOUND')

    const deleted = await makeTenant()
    const d = await makeCoupleAccess(deleted.id)
    await env.DB.prepare('UPDATE tenants SET data_deleted_at = ? WHERE id = ?')
      .bind(Date.now(), deleted.id)
      .run()
    expect(
      await errorCode(
        await request(loginPath(deleted.id), { cookie: `wym_couple_pending=${d.token}` }),
      ),
    ).toBe('TENANT_NOT_FOUND')
  })
})

describe('POST /api/couple/:tenantId/login', () => {
  it('正しいパスコードで入れる（Cookie・pending の削除・セッションはハッシュで保存）', async () => {
    const { tenant, token, access } = await setupLogin()
    const res = await login(tenant.id, token, { passcode: PASSCODE, agreeToTerms: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})

    const cookies = res.headers.getSetCookie()
    const session = cookies.find((c) => c.startsWith(`wym_c_${tenant.id}=`))
    expect(session).toBeDefined()
    expect(session).toContain('HttpOnly')
    expect(session).toContain('Secure')
    expect(session).toContain('SameSite=Lax')
    expect(session).toContain('Path=/')
    const pending = cookies.find((c) => c.startsWith('wym_couple_pending='))
    expect(pending).toBeDefined()
    expect(pending).toMatch(/Max-Age=0|Expires=/)
    expect(pending).toContain('Path=/api/couple')

    const sessionId = (session ?? '').split(';')[0]?.split('=')[1] ?? ''
    expect(sessionId.length).toBeGreaterThan(20)
    const row = await env.DB.prepare(
      'SELECT id_hash, kind, couple_access_id, tenant_id FROM visitor_sessions WHERE id_hash = ?',
    )
      .bind(await sha256Hex(sessionId))
      .first<{ kind: string; couple_access_id: string; tenant_id: string }>()
    expect(row).toMatchObject({ kind: 'couple', couple_access_id: access.id, tenant_id: tenant.id })
    const plain = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM visitor_sessions WHERE id_hash = ?',
    )
      .bind(sessionId)
      .first<{ n: number }>()
    expect(plain?.n).toBe(0)

    expect((await accessRow(access.id))?.terms_agreed_at).not.toBeNull()

    // そのまま API が使える
    const me = await request(`/api/couple/${tenant.id}/me`, {
      cookie: `wym_c_${tenant.id}=${sessionId}`,
    })
    expect(me.status).toBe(200)
  })

  it('小文字・前後の空白があっても通る', async () => {
    const { tenant, token } = await setupLogin()
    const res = await login(tenant.id, token, {
      passcode: `  ${PASSCODE.toLowerCase()} `,
      agreeToTerms: true,
    })
    expect(res.status).toBe(200)
  })

  it('違うと PASSCODE_INVALID と残り回数。5 回目でロックし、ロック中は正しくても拒否', async () => {
    const { tenant, token, access } = await setupLogin()
    for (const remaining of [4, 3, 2, 1]) {
      const res = await login(tenant.id, token, { passcode: 'ZZZZ9999', agreeToTerms: true })
      expect(res.status).toBe(401)
      const body = await res.json<{ error: { code: string; remainingAttempts: number } }>()
      expect(body.error.code).toBe('PASSCODE_INVALID')
      expect(body.error.remainingAttempts).toBe(remaining)
    }
    const fifth = await login(tenant.id, token, { passcode: 'ZZZZ9999', agreeToTerms: true })
    expect(fifth.status).toBe(429)
    const body = await fifth.json<{ error: { code: string; retryAfterSeconds: number } }>()
    expect(body.error.code).toBe('PASSCODE_LOCKED')
    expect(body.error.retryAfterSeconds).toBeGreaterThan(14 * 60)
    expect(body.error.retryAfterSeconds).toBeLessThanOrEqual(15 * 60)
    expect((await accessRow(access.id))?.failed_attempts).toBe(0)

    const locked = await login(tenant.id, token, { passcode: PASSCODE, agreeToTerms: true })
    expect(locked.status).toBe(429)
    expect(await errorCode(locked)).toBe('PASSCODE_LOCKED')
    expect(locked.headers.getSetCookie().some((c) => c.startsWith('wym_c_'))).toBe(false)
  })

  it('ロックが明けたら入れる', async () => {
    const { tenant, token, access } = await setupLogin()
    for (let i = 0; i < 5; i++) {
      await login(tenant.id, token, { passcode: 'ZZZZ9999', agreeToTerms: true })
    }
    await env.DB.prepare('UPDATE couple_accesses SET locked_until = ? WHERE id = ?')
      .bind(Date.now() - 1000, access.id)
      .run()
    const res = await login(tenant.id, token, { passcode: PASSCODE, agreeToTerms: true })
    expect(res.status).toBe(200)
    const row = await accessRow(access.id)
    expect(row?.failed_attempts).toBe(0)
    expect(row?.locked_until).toBeNull()
  })

  it('成功すると失敗回数が 0 に戻る', async () => {
    const { tenant, token, access } = await setupLogin()
    await login(tenant.id, token, { passcode: 'ZZZZ9999', agreeToTerms: true })
    expect((await accessRow(access.id))?.failed_attempts).toBe(1)
    await login(tenant.id, token, { passcode: PASSCODE, agreeToTerms: true })
    expect((await accessRow(access.id))?.failed_attempts).toBe(0)
  })

  it('パスコードが空なら VALIDATION_ERROR', async () => {
    const { tenant, token } = await setupLogin()
    for (const json of [{ agreeToTerms: true }, { passcode: '  ', agreeToTerms: true }]) {
      const res = await login(tenant.id, token, json)
      expect(res.status).toBe(400)
      const body = await res.json<{ error: { code: string; fields: Record<string, string> } }>()
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.fields.passcode).toBe('REQUIRED')
    }
  })

  it('初回は規約への同意が必須（失敗回数は増えない）。2 回目以降は不要', async () => {
    const { tenant, token, access } = await setupLogin()
    for (const json of [{ passcode: PASSCODE }, { passcode: PASSCODE, agreeToTerms: false }]) {
      const res = await login(tenant.id, token, json)
      expect(res.status).toBe(400)
      expect(await errorCode(res)).toBe('TERMS_NOT_AGREED')
    }
    const wrongNoTerms = await login(tenant.id, token, { passcode: 'ZZZZ9999' })
    expect(await errorCode(wrongNoTerms)).toBe('TERMS_NOT_AGREED')
    expect((await accessRow(access.id))?.failed_attempts).toBe(0)

    expect((await login(tenant.id, token, { passcode: PASSCODE, agreeToTerms: true })).status).toBe(
      200,
    )
    const state = await request(loginPath(tenant.id), { cookie: `wym_couple_pending=${token}` })
    expect((await state.json<CoupleLoginStateResponse>()).needsTermsAgreement).toBe(false)
    // 別のブラウザで 2 回目: 同意なしで入れる
    const again = await login(tenant.id, token, { passcode: PASSCODE })
    expect(again.status).toBe(200)
  })

  it('pending Cookie がない・別テナントのトークンなら COUPLE_LINK_INVALID', async () => {
    const a = await setupLogin()
    const b = await setupLogin()
    const none = await login(a.tenant.id, undefined, { passcode: PASSCODE, agreeToTerms: true })
    expect(await errorCode(none)).toBe('COUPLE_LINK_INVALID')
    // テナント A のトークンとパスコードでテナント B に入れない
    const cross = await login(b.tenant.id, a.token, { passcode: PASSCODE, agreeToTerms: true })
    expect(cross.status).toBe(403)
    expect(await errorCode(cross)).toBe('COUPLE_LINK_INVALID')
    expect(cross.headers.getSetCookie()).toEqual([])
  })

  it('停止中・期間外', async () => {
    const suspended = await makeTenant(EVENT.joining, { suspended: true })
    const s = await makeCoupleAccess(suspended.id)
    expect(
      await errorCode(
        await login(suspended.id, s.token, { passcode: PASSCODE, agreeToTerms: true }),
      ),
    ).toBe('TENANT_SUSPENDED')
    const expired = await makeTenant(EVENT.expired)
    const e = await makeCoupleAccess(expired.id)
    expect(
      await errorCode(await login(expired.id, e.token, { passcode: PASSCODE, agreeToTerms: true })),
    ).toBe('PERIOD_ENDED')
  })

  it('CSRF: Origin がないと拒否される', async () => {
    const { tenant, token } = await setupLogin()
    const res = await request(loginPath(tenant.id), {
      method: 'POST',
      cookie: `wym_couple_pending=${token}`,
      origin: null,
      json: { passcode: PASSCODE, agreeToTerms: true },
    })
    expect(res.status).toBe(403)
  })

  it('再発行（issueCoupleAccess）で既存のセッションが使えなくなる', async () => {
    const { tenant, cookie } = await setupSession()
    expect((await request(`/api/couple/${tenant.id}/me`, { cookie })).status).toBe(200)
    await issueCoupleAccess(db, tenant.id, {
      token: 'new-token',
      passcodeHash: await hashPasscode('ZZ99ZZ99'),
    })
    const res = await request(`/api/couple/${tenant.id}/me`, { cookie })
    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('UNAUTHENTICATED')
  })
})

describe('再訪', () => {
  it('一度入ったブラウザは GET /couple/:tenantId で写真一覧へ', async () => {
    const { tenant, token } = await setupLogin()
    const res = await login(tenant.id, token, { passcode: PASSCODE, agreeToTerms: true })
    const session = res.headers.getSetCookie().find((c) => c.startsWith('wym_c_')) ?? ''
    const cookie = session.split(';')[0] ?? ''
    const revisit = await request(`/couple/${tenant.id}`, { cookie })
    expect(revisit.status).toBe(302)
    expect(revisit.headers.get('location')).toBe(`/couple/${tenant.id}/photos`)
  })
})

// ------------------------------------------------------------ 共通の確認・期間

describe('共通の確認', () => {
  it('セッションがなければ UNAUTHENTICATED（pending だけでは使えない）', async () => {
    const { tenant, token } = await setupLogin()
    for (const path of ['me', 'photos', 'photos/ranking', 'uploaders']) {
      const res = await request(`/api/couple/${tenant.id}/${path}`, {
        cookie: `wym_couple_pending=${token}`,
      })
      expect(res.status).toBe(401)
      expect(await errorCode(res)).toBe('UNAUTHENTICATED')
    }
  })

  it('GET /me は結婦式の情報を返す', async () => {
    const { tenant, cookie } = await setupSession()
    const res = await request(`/api/couple/${tenant.id}/me`, { cookie })
    const body: CoupleMeResponse = await res.json()
    expect(body.tenant).toEqual({
      id: tenant.id,
      name: tenant.name,
      eventDate: tenant.eventDate,
      phase: 'joining',
    })
  })

  async function sessionFor(tenant: Tenant) {
    const { access } = await makeCoupleAccess(tenant.id)
    return (await makeCoupleSession(tenant.id, access.id)).cookie
  }

  it('停止中は TENANT_SUSPENDED、削除済みは TENANT_NOT_FOUND', async () => {
    const suspended = await makeTenant(EVENT.joining, { suspended: true })
    const res = await request(`/api/couple/${suspended.id}/me`, {
      cookie: await sessionFor(suspended),
    })
    expect(await errorCode(res)).toBe('TENANT_SUSPENDED')

    const deleted = await makeTenant()
    const cookie = await sessionFor(deleted)
    await env.DB.prepare('UPDATE tenants SET data_deleted_at = ? WHERE id = ?')
      .bind(Date.now(), deleted.id)
      .run()
    expect(await errorCode(await request(`/api/couple/${deleted.id}/me`, { cookie }))).toBe(
      'TENANT_NOT_FOUND',
    )
  })

  it('新郎新婦閲覧期間でも使え、期限切れ（expired）では PERIOD_ENDED', async () => {
    for (const days of [EVENT.preparation, EVENT.viewing, EVENT.coupleOnly]) {
      const tenant = await makeTenant(days)
      const res = await request(`/api/couple/${tenant.id}/photos`, {
        cookie: await sessionFor(tenant),
      })
      expect(res.status, `days=${days}`).toBe(200)
    }
    const expired = await makeTenant(EVENT.expired)
    const res = await request(`/api/couple/${expired.id}/photos`, {
      cookie: await sessionFor(expired),
    })
    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('PERIOD_ENDED')
  })

  it('新郎新婦閲覧期間は参加者は使えない（新郎新婦は使える）', async () => {
    const tenant = await makeTenant(EVENT.coupleOnly)
    const guest = await makeGuestSession(tenant.id, 'たろう')
    const g = await request(`/api/t/${tenant.id}/photos`, { cookie: guest.cookie })
    expect(await errorCode(g)).toBe('PERIOD_ENDED')
    const c = await request(`/api/couple/${tenant.id}/photos`, { cookie: await sessionFor(tenant) })
    expect(c.status).toBe(200)
  })
})

// ------------------------------------------------------------ 写真

describe('GET /photos', () => {
  it('新しい順・uploader.id あり・カーソルで続きが取れる', async () => {
    const { tenant, cookie } = await setupSession()
    const g = await makeGuestSession(tenant.id, 'たろう')
    const base = Date.now() - 10_000
    const ids = [
      await seedPhoto(tenant.id, g.guest.id, base + 1),
      await seedPhoto(tenant.id, g.guest.id, base + 2),
      await seedPhoto(tenant.id, g.guest.id, base + 3),
    ]
    const first: CouplePhotoListResponse = await (
      await request(`/api/couple/${tenant.id}/photos?limit=2`, { cookie })
    ).json()
    expect(first.photos.map((p) => p.id)).toEqual([ids[2], ids[1]])
    expect(first.nextCursor).not.toBeNull()
    const photo = first.photos[0]
    expect(photo?.uploader).toEqual({ id: g.guest.id, nickname: 'たろう' })
    expect(photo?.urls.thumb).toBe(`/api/couple/${tenant.id}/photos/${ids[2]}/thumb`)
    expect(photo).not.toHaveProperty('likedByMe')
    expect(photo).not.toHaveProperty('isMine')

    const second: CouplePhotoListResponse = await (
      await request(
        `/api/couple/${tenant.id}/photos?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
        { cookie },
      )
    ).json()
    expect(second.photos.map((p) => p.id)).toEqual([ids[0]])
    expect(second.nextCursor).toBeNull()
  })

  it('不正な limit・cursor は VALIDATION_ERROR', async () => {
    const { tenant, cookie } = await setupSession()
    for (const q of ['limit=0', 'limit=abc', 'cursor=@@@']) {
      const res = await request(`/api/couple/${tenant.id}/photos?${q}`, { cookie })
      expect(res.status, q).toBe(400)
      expect(await errorCode(res)).toBe('VALIDATION_ERROR')
    }
  })

  it('投稿者で絞り込める。他テナント・存在しない参加者なら空', async () => {
    const { tenant, cookie } = await setupSession()
    const other = await makeTenant()
    const a = await makeGuestSession(tenant.id, 'あ')
    const b = await makeGuestSession(tenant.id, 'い')
    const o = await makeGuestSession(other.id, 'う')
    const pa = await seedPhoto(tenant.id, a.guest.id)
    await seedPhoto(tenant.id, b.guest.id)
    await seedPhoto(other.id, o.guest.id)

    const list = async (uploaderId: string): Promise<CouplePhotoListResponse> =>
      (await request(`/api/couple/${tenant.id}/photos?uploaderId=${uploaderId}`, { cookie })).json()
    expect((await list(a.guest.id)).photos.map((p) => p.id)).toEqual([pa])
    expect((await list(o.guest.id)).photos).toEqual([])
    expect((await list(newId())).photos).toEqual([])
  })
})

describe('GET /photos/ranking', () => {
  it('参加者向けと同じ順位', async () => {
    const { tenant, cookie } = await setupSession()
    const g1 = await makeGuestSession(tenant.id, 'あ')
    const g2 = await makeGuestSession(tenant.id, 'い')
    const g3 = await makeGuestSession(tenant.id, 'う')
    const base = Date.now() - 10_000
    const p1 = await seedPhoto(tenant.id, g1.guest.id, base + 1)
    const p2 = await seedPhoto(tenant.id, g1.guest.id, base + 2)
    const p3 = await seedPhoto(tenant.id, g1.guest.id, base + 3)
    await likePhoto(db, tenant.id, g2.guest.id, p1)
    await likePhoto(db, tenant.id, g3.guest.id, p1)
    await likePhoto(db, tenant.id, g2.guest.id, p2)
    void p3

    const couple: CoupleRankingResponse = await (
      await request(`/api/couple/${tenant.id}/photos/ranking`, { cookie })
    ).json()
    const guest: GuestRankingResponse = await (
      await request(`/api/t/${tenant.id}/photos/ranking`, { cookie: g1.cookie })
    ).json()
    expect(couple.photos.map((p) => [p.id, p.rank, p.likeCount])).toEqual(
      guest.photos.map((p) => [p.id, p.rank, p.likeCount]),
    )
    expect(couple.photos[0]?.id).toBe(p1)
    expect(couple.photos[0]?.uploader.id).toBe(g1.guest.id)
  })
})

describe('GET /uploaders', () => {
  it('投稿 0 枚の人を含まず、ニックネーム順', async () => {
    const { tenant, cookie } = await setupSession()
    const z = await makeGuestSession(tenant.id, 'ゆうこ')
    const a = await makeGuestSession(tenant.id, 'あきら')
    await makeGuestSession(tenant.id, 'なし')
    await seedPhoto(tenant.id, z.guest.id)
    await seedPhoto(tenant.id, a.guest.id)
    await seedPhoto(tenant.id, a.guest.id)
    const body: UploadersResponse = await (
      await request(`/api/couple/${tenant.id}/uploaders`, { cookie })
    ).json()
    expect(body.uploaders).toEqual([
      { id: a.guest.id, nickname: 'あきら', photoCount: 2 },
      { id: z.guest.id, nickname: 'ゆうこ', photoCount: 1 },
    ])
  })
})

describe('画像', () => {
  it('3 種類を返し、original?download=1 は attachment つき', async () => {
    const { tenant, cookie } = await setupSession()
    const g = await makeGuestSession(tenant.id, 'たろう')
    const id = await seedPhoto(tenant.id, g.guest.id, Date.now(), true)
    const base = `/api/couple/${tenant.id}/photos/${id}`

    const thumb = await request(`${base}/thumb`, { cookie })
    expect(thumb.status).toBe(200)
    expect(thumb.headers.get('content-type')).toBe('image/jpeg')
    expect(thumb.headers.get('cache-control')).toContain('private')
    const display = await request(`${base}/display`, { cookie })
    expect(display.status).toBe(200)
    const original = await request(`${base}/original`, { cookie })
    expect(original.headers.get('content-type')).toBe('image/png')
    expect(original.headers.get('content-disposition')).toBeNull()
    const download = await request(`${base}/original?download=1`, { cookie })
    expect(download.status).toBe(200)
    expect(download.headers.get('content-disposition')).toBe(
      `attachment; filename="wedding-photo-${id}.png"`,
    )
    expect((await request(`${base}/huge`, { cookie })).status).toBe(404)
  })
})

// ------------------------------------------------------------ テナント分離・できないこと

describe('テナント分離', () => {
  it('テナント A のセッションでテナント B の API は使えない', async () => {
    const a = await setupSession()
    const b = await setupSession()
    for (const path of ['me', 'photos', 'photos/ranking', 'uploaders']) {
      const res = await request(`/api/couple/${b.tenant.id}/${path}`, { cookie: a.cookie })
      expect(res.status, path).toBe(401)
      expect(await errorCode(res)).toBe('UNAUTHENTICATED')
    }
    // Cookie 名を B にそろえても、セッションの tenant_id が違うので使えない
    const sessionId = a.cookie.split('=')[1]
    const forged = await request(`/api/couple/${b.tenant.id}/me`, {
      cookie: `wym_c_${b.tenant.id}=${sessionId}`,
    })
    expect(forged.status).toBe(401)
  })

  it('テナント A の新郎新婦がテナント B の写真 ID を指定しても NOT_FOUND', async () => {
    const a = await setupSession()
    const b = await setupSession()
    const g = await makeGuestSession(b.tenant.id, 'たろう')
    const photoId = await seedPhoto(b.tenant.id, g.guest.id)
    for (const variant of ['thumb', 'display', 'original', 'original?download=1']) {
      const res = await request(`/api/couple/${a.tenant.id}/photos/${photoId}/${variant}`, {
        cookie: a.cookie,
      })
      expect(res.status, variant).toBe(404)
      expect(await errorCode(res)).toBe('NOT_FOUND')
    }
    // 自分のテナントの一覧に B の写真は出ない
    const list: CouplePhotoListResponse = await (
      await request(`/api/couple/${a.tenant.id}/photos`, { cookie: a.cookie })
    ).json()
    expect(list.photos).toEqual([])
  })
})

describe('新郎新婦にできないこと', () => {
  it('投稿・削除・いいねのルートがない', async () => {
    const { tenant, cookie } = await setupSession()
    const g = await makeGuestSession(tenant.id, 'たろう')
    const photoId = await seedPhoto(tenant.id, g.guest.id)
    const base = `/api/couple/${tenant.id}/photos`
    const attempts: [string, string][] = [
      ['POST', base],
      ['DELETE', `${base}/${photoId}`],
      ['PUT', `${base}/${photoId}/like`],
      ['DELETE', `${base}/${photoId}/like`],
    ]
    for (const [method, path] of attempts) {
      const res = await request(path, { method, cookie })
      expect(res.status, `${method} ${path}`).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThan(500)
    }
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM photos WHERE tenant_id = ?')
      .bind(tenant.id)
      .first<{ n: number }>()
    expect(row?.n).toBe(1)
  })

  it('参加者向けのパスは新郎新婦の Cookie では UNAUTHENTICATED', async () => {
    const { tenant, cookie } = await setupSession()
    const g = await makeGuestSession(tenant.id, 'たろう')
    const photoId = await seedPhoto(tenant.id, g.guest.id)
    const base = `/api/t/${tenant.id}/photos`
    const attempts: [string, string][] = [
      ['POST', base],
      ['DELETE', `${base}/${photoId}`],
      ['PUT', `${base}/${photoId}/like`],
      ['GET', base],
    ]
    for (const [method, path] of attempts) {
      const res = await request(path, { method, cookie })
      expect(res.status, `${method} ${path}`).toBe(401)
      expect(await errorCode(res)).toBe('UNAUTHENTICATED')
    }
  })
})
