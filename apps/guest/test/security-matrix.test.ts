// 全エンドポイントの認可の表（T18）。ルートの一覧は Hono の登録から作り、
// 新しいルートが増えたら ROUTES への追加を忘れないよう、一覧の一致を確かめる。

import { newId } from '@wym/db'
import { describe, expect, it } from 'vitest'
import { app } from '../src/worker/app'
import {
  EVENT,
  errorCode,
  eventDateOffset,
  makeCoupleAccess,
  makeCoupleSession,
  makeGuestSession,
  makeTenant,
  request,
} from './helpers'
import { setTenant } from './seed'

/**
 * guest: 参加者のセッション（ニックネーム登録済み）が要る
 * guest-me: 参加者のセッションだけでよい（ニックネーム未登録でも可）
 * couple: 新郎新婦のセッションが要る
 * couple-login: 新郎新婦用 URL の pending Cookie が要る
 * public: 認証なし
 * page-join / page-couple: サーバー側のページ遷移（リダイレクトで答える）
 */
type Kind =
  | 'guest'
  | 'guest-me'
  | 'couple'
  | 'couple-login'
  | 'public'
  | 'page-join'
  | 'page-couple'

const ROUTES: Record<string, Kind> = {
  'GET /join/:tenantId': 'page-join',
  'GET /couple/:tenantId': 'page-couple',
  'GET /api/config': 'public',
  'GET /api/t/:tenantId/me': 'guest-me',
  'PUT /api/t/:tenantId/me/nickname': 'guest-me',
  'GET /api/t/:tenantId/seating-chart': 'guest',
  'GET /api/t/:tenantId/course-menu': 'guest',
  'GET /api/t/:tenantId/course-menu/images/:imageId': 'guest',
  'GET /api/t/:tenantId/photos': 'guest',
  'GET /api/t/:tenantId/photos/ranking': 'guest',
  'POST /api/t/:tenantId/photos': 'guest',
  'DELETE /api/t/:tenantId/photos/:photoId': 'guest',
  'PUT /api/t/:tenantId/photos/:photoId/like': 'guest',
  'DELETE /api/t/:tenantId/photos/:photoId/like': 'guest',
  'GET /api/t/:tenantId/photos/:photoId/:variant': 'guest',
  'GET /api/couple/:tenantId/login': 'couple-login',
  'POST /api/couple/:tenantId/login': 'couple-login',
  'GET /api/couple/:tenantId/me': 'couple',
  'GET /api/couple/:tenantId/photos': 'couple',
  'GET /api/couple/:tenantId/photos/ranking': 'couple',
  'GET /api/couple/:tenantId/uploaders': 'couple',
  'GET /api/couple/:tenantId/photos/:photoId/:variant': 'couple',
}

/** GET には本文を付けられない */
const bodyFor = (method: string) =>
  method === 'GET' ? undefined : { passcode: 'AB12CD34', agreeToTerms: true }

const SAFE = new Set(['GET', 'HEAD'])

function parse(key: string) {
  const [method = '', pattern = ''] = key.split(' ')
  return { method, pattern }
}

function fill(pattern: string, tenantId: string): string {
  return pattern
    .replace(':tenantId', tenantId)
    .replace(':photoId', newId())
    .replace(':imageId', newId())
    .replace(':variant', 'thumb')
}

const entries = (...kinds: Kind[]) =>
  Object.entries(ROUTES).filter(([, kind]) => kinds.includes(kind))

const EVIL = 'https://evil.example'

describe('ルートの一覧', () => {
  it('登録されているルートがすべて表にあり、表に余分なものがない', () => {
    const registered = app.routes
      .filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} ${route.path}`)
    expect([...registered].sort()).toEqual(Object.keys(ROUTES).sort())
  })
})

describe('(a) 認証なし', () => {
  it.each(entries('guest', 'guest-me', 'couple'))('%s は UNAUTHENTICATED', async (key) => {
    const { method, pattern } = parse(key)
    const tenant = await makeTenant()
    const res = await request(fill(pattern, tenant.id), { method })
    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('UNAUTHENTICATED')
  })

  it.each(entries('couple-login'))(
    '%s は pending Cookie がなければ COUPLE_LINK_INVALID',
    async (key) => {
      const { method, pattern } = parse(key)
      const tenant = await makeTenant()
      await makeCoupleAccess(tenant.id)
      const res = await request(fill(pattern, tenant.id), { method, json: bodyFor(method) })
      expect(res.status).toBe(403)
      expect(await errorCode(res)).toBe('COUPLE_LINK_INVALID')
    },
  )

  it('参加 URL は参加トークンがなければエラー画面へ（セッションを作らない）', async () => {
    const tenant = await makeTenant()
    const res = await request(`/join/${tenant.id}`)
    expect(res.headers.get('location')).toBe('/error?code=JOIN_TOKEN_INVALID')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('新郎新婦用 URL はトークンがなければエラー画面へ（pending Cookie を作らない）', async () => {
    const tenant = await makeTenant()
    const res = await request(`/couple/${tenant.id}`)
    expect(res.headers.get('location')).toContain('/error?code=UNAUTHENTICATED')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('/api/config は認証なしで使える（公開してよい情報だけ）', async () => {
    const res = await request('/api/config')
    expect(res.status).toBe(200)
    expect(Object.keys(await res.json<object>())).toEqual(['contactEmail'])
  })
})

describe('(b) 他テナントのセッション', () => {
  // A のセッションの Cookie を、B の URL に向けて送る。Cookie 名を B のものに偽装した場合も含む
  it.each(entries('guest', 'guest-me'))(
    '%s: 参加者 A のセッションで B の API は使えない',
    async (key) => {
      const { method, pattern } = parse(key)
      const a = await makeTenant()
      const b = await makeTenant()
      const session = await makeGuestSession(a.id, 'たろう')
      await makeGuestSession(b.id, 'はなこ')

      const natural = await request(fill(pattern, b.id), { method, cookie: session.cookie })
      expect(natural.status).toBe(401)
      expect(await errorCode(natural)).toBe('UNAUTHENTICATED')

      const forged = await request(fill(pattern, b.id), {
        method,
        cookie: `wym_g_${b.id}=${session.sessionId}`,
      })
      expect(forged.status).toBe(401)
      expect(await errorCode(forged)).toBe('UNAUTHENTICATED')
    },
  )

  it.each(entries('couple'))('%s: 新郎新婦 A のセッションで B の API は使えない', async (key) => {
    const { method, pattern } = parse(key)
    const a = await makeTenant()
    const b = await makeTenant()
    const accessA = await makeCoupleAccess(a.id)
    await makeCoupleAccess(b.id)
    const session = await makeCoupleSession(a.id, accessA.access.id)

    const natural = await request(fill(pattern, b.id), { method, cookie: session.cookie })
    expect(natural.status).toBe(401)
    const forged = await request(fill(pattern, b.id), {
      method,
      cookie: `wym_c_${b.id}=${session.sessionId}`,
    })
    expect(forged.status).toBe(401)
    expect(await errorCode(forged)).toBe('UNAUTHENTICATED')
  })

  it.each(entries('couple-login'))(
    '%s: A のトークンの pending Cookie で B の入場はできない',
    async (key) => {
      const { method, pattern } = parse(key)
      const a = await makeTenant()
      const b = await makeTenant()
      const accessA = await makeCoupleAccess(a.id)
      await makeCoupleAccess(b.id)
      const res = await request(fill(pattern, b.id), {
        method,
        cookie: `wym_couple_pending=${accessA.token}`,
        json: bodyFor(method),
      })
      expect(res.status).toBe(403)
      expect(await errorCode(res)).toBe('COUPLE_LINK_INVALID')
    },
  )

  it('A の参加トークンで B の参加 URL から参加できない', async () => {
    const { makeJoinToken } = await import('./helpers')
    const a = await makeTenant()
    const b = await makeTenant()
    const tokenA = await makeJoinToken(a.id)
    await makeJoinToken(b.id)
    const res = await request(`/join/${b.id}?t=${tokenA}`)
    expect(res.headers.get('location')).toBe('/error?code=JOIN_TOKEN_INVALID')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('A の新郎新婦用トークンで B の新郎新婦用ページに入れない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const accessA = await makeCoupleAccess(a.id)
    await makeCoupleAccess(b.id)
    const res = await request(`/couple/${b.id}?t=${accessA.token}`)
    expect(res.headers.get('location')).toBe('/error?code=COUPLE_LINK_INVALID&audience=couple')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('種類の取り違え: 新郎新婦のセッション ID は参加者の Cookie 名では通らない（逆も同じ）', async () => {
    const tenant = await makeTenant()
    const { access } = await makeCoupleAccess(tenant.id)
    const couple = await makeCoupleSession(tenant.id, access.id)
    const guest = await makeGuestSession(tenant.id, 'たろう')

    const asGuest = await request(`/api/t/${tenant.id}/me`, {
      cookie: `wym_g_${tenant.id}=${couple.sessionId}`,
    })
    expect(asGuest.status).toBe(401)
    const asCouple = await request(`/api/couple/${tenant.id}/me`, {
      cookie: `wym_c_${tenant.id}=${guest.sessionId}`,
    })
    expect(asCouple.status).toBe(401)
    // 本来の組み合わせなら通る
    expect((await request(`/api/t/${tenant.id}/me`, { cookie: guest.cookie })).status).toBe(200)
    expect((await request(`/api/couple/${tenant.id}/me`, { cookie: couple.cookie })).status).toBe(
      200,
    )
  })

  it('UUID でないテナント ID・存在しないテナント ID でも情報を漏らさない', async () => {
    const tenant = await makeTenant()
    const session = await makeGuestSession(tenant.id, 'たろう')
    for (const id of ['not-a-uuid', newId(), "x'; DROP TABLE tenants;--"]) {
      const res = await request(`/api/t/${encodeURIComponent(id)}/me`, { cookie: session.cookie })
      expect(res.status).toBe(401)
    }
  })
})

describe('(c) 期間外・停止中・削除済み', () => {
  const guestCases = [
    ['停止中', { suspended: true }, 'TENANT_SUSPENDED'],
    [
      '閲覧期間の後（新郎新婦閲覧期間）',
      { eventDate: eventDateOffset(EVENT.coupleOnly) },
      'PERIOD_ENDED',
    ],
    ['期限切れ', { eventDate: eventDateOffset(EVENT.expired) }, 'PERIOD_ENDED'],
    ['準備期間', { eventDate: eventDateOffset(EVENT.preparation) }, 'PERIOD_ENDED'],
    ['データ削除済み', { deleted: true }, 'TENANT_NOT_FOUND'],
  ] as const

  describe.each(guestCases)('参加者: %s', (_label, change, code) => {
    it.each(entries('guest', 'guest-me'))(`%s は ${code}`, async (key) => {
      const { method, pattern } = parse(key)
      const tenant = await makeTenant()
      const session = await makeGuestSession(tenant.id, 'たろう')
      await setTenant(tenant.id, change)
      const res = await request(fill(pattern, tenant.id), { method, cookie: session.cookie })
      expect(await errorCode(res)).toBe(code)
      expect(res.status).toBeGreaterThanOrEqual(400)
    })
  })

  const coupleCases = [
    ['停止中', { suspended: true }, 'TENANT_SUSPENDED'],
    ['期限切れ（データ削除の時期）', { eventDate: eventDateOffset(EVENT.expired) }, 'PERIOD_ENDED'],
    ['データ削除済み', { deleted: true }, 'TENANT_NOT_FOUND'],
  ] as const

  describe.each(coupleCases)('新郎新婦: %s', (_label, change, code) => {
    it.each(entries('couple'))(`%s は ${code}`, async (key) => {
      const { method, pattern } = parse(key)
      const tenant = await makeTenant()
      const { access } = await makeCoupleAccess(tenant.id)
      const session = await makeCoupleSession(tenant.id, access.id)
      await setTenant(tenant.id, change)
      const res = await request(fill(pattern, tenant.id), { method, cookie: session.cookie })
      expect(await errorCode(res)).toBe(code)
    })

    it.each(entries('couple-login'))(`%s は ${code}`, async (key) => {
      const { method, pattern } = parse(key)
      const tenant = await makeTenant()
      const { token } = await makeCoupleAccess(tenant.id)
      await setTenant(tenant.id, change)
      const res = await request(fill(pattern, tenant.id), {
        method,
        cookie: `wym_couple_pending=${token}`,
        json: bodyFor(method),
      })
      expect(await errorCode(res)).toBe(code)
    })
  })

  it('新郎新婦の用 URL を再発行すると、古いセッションは全ルートで拒否される', async () => {
    const tenant = await makeTenant()
    const { access } = await makeCoupleAccess(tenant.id)
    const session = await makeCoupleSession(tenant.id, access.id)
    await makeCoupleAccess(tenant.id)
    for (const [key] of entries('couple')) {
      const { method, pattern } = parse(key)
      const res = await request(fill(pattern, tenant.id), { method, cookie: session.cookie })
      expect(res.status, key).toBe(401)
    }
  })

  it('参加 URL: 停止中・期間外・削除済みは参加できず、Cookie も作られない', async () => {
    const { makeJoinToken } = await import('./helpers')
    const cases = [
      [{ suspended: true }, 'TENANT_SUSPENDED'],
      [{ eventDate: eventDateOffset(EVENT.viewing) }, 'OUTSIDE_JOINING_PERIOD'],
      [{ eventDate: eventDateOffset(EVENT.preparation) }, 'OUTSIDE_JOINING_PERIOD'],
      [{ deleted: true }, 'TENANT_NOT_FOUND'],
    ] as const
    for (const [change, code] of cases) {
      const tenant = await makeTenant()
      const token = await makeJoinToken(tenant.id)
      await setTenant(tenant.id, change)
      const res = await request(`/join/${tenant.id}?t=${token}`)
      expect(res.headers.get('location')).toBe(`/error?code=${code}`)
      expect(res.headers.get('set-cookie')).toBeNull()
    }
  })

  it('新郎新婦用 URL: 停止中・期限切れ・削除済みは入れず、Cookie も作られない', async () => {
    const cases = [
      [{ suspended: true }, 'TENANT_SUSPENDED'],
      [{ eventDate: eventDateOffset(EVENT.expired) }, 'PERIOD_ENDED'],
      [{ deleted: true }, 'TENANT_NOT_FOUND'],
    ] as const
    for (const [change, code] of cases) {
      const tenant = await makeTenant()
      const { token } = await makeCoupleAccess(tenant.id)
      await setTenant(tenant.id, change)
      const res = await request(`/couple/${tenant.id}?t=${token}`)
      expect(res.headers.get('location')).toBe(`/error?code=${code}&audience=couple`)
      expect(res.headers.get('set-cookie')).toBeNull()
    }
  })

  it('ニックネーム未登録の参加者は、me 系以外で NICKNAME_REQUIRED', async () => {
    const tenant = await makeTenant()
    const session = await makeGuestSession(tenant.id)
    for (const [key] of entries('guest')) {
      const { method, pattern } = parse(key)
      const res = await request(fill(pattern, tenant.id), { method, cookie: session.cookie })
      expect(await errorCode(res), key).toBe('NICKNAME_REQUIRED')
    }
  })
})

describe('(d) CSRF（状態を変えるリクエスト）', () => {
  const mutating = Object.entries(ROUTES).filter(
    ([key, kind]) => !SAFE.has(parse(key).method) && kind !== 'page-join' && kind !== 'page-couple',
  )

  it('GET 以外の API ルートが存在する（表の取りこぼし防止）', () => {
    expect(mutating.length).toBeGreaterThanOrEqual(6)
  })

  it.each(mutating)(
    '%s は Origin がない・別オリジンなら FORBIDDEN（有効なセッションがあっても）',
    async (key, kind) => {
      const { method, pattern } = parse(key)
      const tenant = await makeTenant()
      let cookie: string | undefined
      if (kind === 'guest' || kind === 'guest-me') {
        cookie = (await makeGuestSession(tenant.id, 'たろう')).cookie
      } else if (kind === 'couple-login') {
        cookie = `wym_couple_pending=${(await makeCoupleAccess(tenant.id)).token}`
      }
      for (const origin of [
        null,
        EVIL,
        'http://would-you-marry.me',
        `${EVIL}/https://would-you-marry.me`,
      ]) {
        const res = await request(fill(pattern, tenant.id), {
          method,
          cookie,
          origin,
          json: { nickname: 'へんこう', passcode: 'AB12CD34', agreeToTerms: true },
        })
        expect(res.status, `${key} origin=${origin}`).toBe(403)
        expect(await errorCode(res)).toBe('FORBIDDEN')
      }
    },
  )

  it('別オリジンからの変更は実際に反映されない（ニックネーム）', async () => {
    const tenant = await makeTenant()
    const session = await makeGuestSession(tenant.id, 'たろう')
    await request(`/api/t/${tenant.id}/me/nickname`, {
      method: 'PUT',
      cookie: session.cookie,
      origin: EVIL,
      json: { nickname: 'のっとり' },
    })
    const me = await request(`/api/t/${tenant.id}/me`, { cookie: session.cookie })
    expect((await me.json<{ me: { nickname: string } }>()).me.nickname).toBe('たろう')
  })

  it('API に CORS の許可ヘッダーを付けていない', async () => {
    const tenant = await makeTenant()
    const session = await makeGuestSession(tenant.id, 'たろう')
    const res = await request(`/api/t/${tenant.id}/me`, { cookie: session.cookie, origin: EVIL })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(res.headers.get('access-control-allow-credentials')).toBeNull()
  })
})

describe('認可の表（auth.md）', () => {
  it('新郎新婦は投稿・いいね・削除ができない（ルートがなく、どのメソッドでも成功しない）', async () => {
    const tenant = await makeTenant()
    const { access } = await makeCoupleAccess(tenant.id)
    const session = await makeCoupleSession(tenant.id, access.id)
    const photoId = newId()
    for (const [method, path] of [
      ['POST', `/api/couple/${tenant.id}/photos`],
      ['DELETE', `/api/couple/${tenant.id}/photos/${photoId}`],
      ['PUT', `/api/couple/${tenant.id}/photos/${photoId}/like`],
      ['DELETE', `/api/couple/${tenant.id}/photos/${photoId}/like`],
      ['PUT', `/api/couple/${tenant.id}/me/nickname`],
    ] as const) {
      const res = await request(path, { method, cookie: session.cookie, json: {} })
      expect(res.status, `${method} ${path}`).toBeGreaterThanOrEqual(400)
      expect(res.status, `${method} ${path}`).toBeLessThan(500)
    }
  })

  it('新郎新婦のセッションでは、参加者向けの投稿・いいね・削除・ニックネーム変更もできない', async () => {
    const tenant = await makeTenant()
    const { access } = await makeCoupleAccess(tenant.id)
    const couple = await makeCoupleSession(tenant.id, access.id)
    const cookie = `wym_g_${tenant.id}=${couple.sessionId}`
    const photoId = newId()
    for (const [method, path] of [
      ['POST', `/api/t/${tenant.id}/photos`],
      ['DELETE', `/api/t/${tenant.id}/photos/${photoId}`],
      ['PUT', `/api/t/${tenant.id}/photos/${photoId}/like`],
      ['PUT', `/api/t/${tenant.id}/me/nickname`],
    ] as const) {
      const res = await request(path, { method, cookie, json: { nickname: 'x' } })
      expect(res.status, `${method} ${path}`).toBe(401)
    }
  })

  it('参加者は他人の写真を削除できず、いいねは他テナントの写真に付けられない', async () => {
    const { seedPhoto } = await import('./seed')
    const a = await makeTenant()
    const b = await makeTenant()
    const owner = await makeGuestSession(a.id, 'もちぬし')
    const other = await makeGuestSession(a.id, 'ほかのひと')
    const outsider = await makeGuestSession(b.id, 'がいぶ')
    const photo = await seedPhoto(a.id, owner.guest.id)

    const del = await request(`/api/t/${a.id}/photos/${photo.id}`, {
      method: 'DELETE',
      cookie: other.cookie,
    })
    expect(del.status).toBe(403)
    expect(await errorCode(del)).toBe('FORBIDDEN')

    const crossDelete = await request(`/api/t/${b.id}/photos/${photo.id}`, {
      method: 'DELETE',
      cookie: outsider.cookie,
    })
    expect(crossDelete.status).toBe(404)
    const crossLike = await request(`/api/t/${b.id}/photos/${photo.id}/like`, {
      method: 'PUT',
      cookie: outsider.cookie,
    })
    expect(crossLike.status).toBe(404)

    // 写真は残っている
    const list = await request(`/api/t/${a.id}/photos`, { cookie: owner.cookie })
    expect((await list.json<{ photos: unknown[] }>()).photos).toHaveLength(1)
  })

  it('参加者は投稿者で絞り込めない（uploaderId は無視され、投稿者の ID も見えない）', async () => {
    const { seedPhoto } = await import('./seed')
    const tenant = await makeTenant()
    const a = await makeGuestSession(tenant.id, 'あ')
    const b = await makeGuestSession(tenant.id, 'い')
    await seedPhoto(tenant.id, a.guest.id)
    await seedPhoto(tenant.id, b.guest.id)
    const res = await request(`/api/t/${tenant.id}/photos?uploaderId=${a.guest.id}`, {
      cookie: b.cookie,
    })
    const body = await res.json<{ photos: { uploader: Record<string, unknown> }[] }>()
    expect(body.photos).toHaveLength(2)
    for (const photo of body.photos) expect(photo.uploader).not.toHaveProperty('id')
  })

  it('新郎新婦の一覧には uploader.id があり、参加者向けの likedByMe・isMine はない', async () => {
    const { seedPhoto } = await import('./seed')
    const tenant = await makeTenant()
    const guest = await makeGuestSession(tenant.id, 'あ')
    await seedPhoto(tenant.id, guest.guest.id)
    const { access } = await makeCoupleAccess(tenant.id)
    const couple = await makeCoupleSession(tenant.id, access.id)
    const res = await request(`/api/couple/${tenant.id}/photos`, { cookie: couple.cookie })
    const body = await res.json<{ photos: Record<string, unknown>[] }>()
    expect(body.photos[0]).toHaveProperty('uploader.id', guest.guest.id)
    expect(body.photos[0]).not.toHaveProperty('likedByMe')
    expect(body.photos[0]).not.toHaveProperty('isMine')
  })

  it('管理者のセッション（別オリジンの Better Auth の Cookie）ではユーザー画面の API を使えない', async () => {
    const tenant = await makeTenant()
    await makeGuestSession(tenant.id, 'たろう')
    const cookie = 'better-auth.session_token=abc.def; __Secure-better-auth.session_token=abc.def'
    for (const path of [`/api/t/${tenant.id}/me`, `/api/couple/${tenant.id}/me`]) {
      const res = await request(path, { cookie })
      expect(res.status).toBe(401)
    }
  })
})
