// Cookie の属性、ヘッダー、画像・PDF の配信、ログ（T18）
import { env } from 'cloudflare:workers'
import { sha256Hex } from '@wym/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/worker/app'
import {
  EVENT,
  errorCode,
  eventDateOffset,
  makeCoupleAccess,
  makeCoupleSession,
  makeGuestSession,
  makeJoinToken,
  makeTenant,
  ORIGIN,
  PASSCODE,
  request,
} from './helpers'
import { seedMenuImage, seedPhoto, seedSeatingChart, setTenant } from './seed'

const SECURITY_HEADERS = {
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
}

function expectSecurityHeaders(res: Response, label: string) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    expect(res.headers.get(name), `${label}: ${name}`).toBe(value)
  }
}

// ------------------------------------------------------------ Cookie

function attrsOf(setCookie: string) {
  const [pair = '', ...attrs] = setCookie.split(';').map((part) => part.trim())
  const eq = pair.indexOf('=')
  return { name: pair.slice(0, eq), value: pair.slice(eq + 1), attrs }
}

function expectNoDomain(attrs: string[]) {
  expect(attrs.some((a) => a.toLowerCase().startsWith('domain'))).toBe(false)
}

describe('Cookie の属性', () => {
  it('参加者のセッション wym_g_{tenantId}: HttpOnly・Secure・SameSite=Lax・Path=/・400 日・ドメインなし', async () => {
    const tenant = await makeTenant()
    const token = await makeJoinToken(tenant.id)
    const res = await request(`/join/${tenant.id}?t=${token}`)
    const cookies = res.headers.getSetCookie()
    expect(cookies).toHaveLength(1)
    const { name, value, attrs } = attrsOf(cookies[0] ?? '')
    expect(name).toBe(`wym_g_${tenant.id}`)
    expect(value.length).toBeGreaterThanOrEqual(32)
    expect(attrs).toEqual(
      expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=34560000']),
    )
    expectNoDomain(attrs)
  })

  it('新郎新婦のセッション wym_c_{tenantId} と pending の削除: 同じ属性、pending は Path=/api/couple で消える', async () => {
    const tenant = await makeTenant()
    const { token } = await makeCoupleAccess(tenant.id)
    const res = await request(`/api/couple/${tenant.id}/login`, {
      method: 'POST',
      cookie: `wym_couple_pending=${token}`,
      json: { passcode: PASSCODE, agreeToTerms: true },
    })
    expect(res.status).toBe(200)
    const cookies = res.headers.getSetCookie().map(attrsOf)
    expect(cookies).toHaveLength(2)

    const session = cookies.find((c) => c.name === `wym_c_${tenant.id}`)
    expect(session).toBeDefined()
    expect(session?.attrs).toEqual(
      expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=34560000']),
    )
    expectNoDomain(session?.attrs ?? [])

    const pending = cookies.find((c) => c.name === 'wym_couple_pending')
    expect(pending?.value).toBe('')
    expect(pending?.attrs).toEqual(expect.arrayContaining(['Secure', 'Path=/api/couple', 'Max-Age=0']))
    expectNoDomain(pending?.attrs ?? [])
  })

  it('wym_couple_pending: HttpOnly・Secure・SameSite=Lax・Path=/api/couple・15 分・ドメインなし', async () => {
    const tenant = await makeTenant()
    const { token } = await makeCoupleAccess(tenant.id)
    const res = await request(`/couple/${tenant.id}?t=${token}`)
    const cookies = res.headers.getSetCookie()
    expect(cookies).toHaveLength(1)
    const { name, attrs } = attrsOf(cookies[0] ?? '')
    expect(name).toBe('wym_couple_pending')
    expect(attrs).toEqual(
      expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api/couple', 'Max-Age=900']),
    )
    expectNoDomain(attrs)
  })

  it('失敗したときは Cookie を発行しない（パスコード違い・ロック・トークン無効）', async () => {
    const tenant = await makeTenant()
    const { token } = await makeCoupleAccess(tenant.id)
    for (let i = 0; i < 6; i++) {
      const res = await request(`/api/couple/${tenant.id}/login`, {
        method: 'POST',
        cookie: `wym_couple_pending=${token}`,
        json: { passcode: 'ZZZZ9999', agreeToTerms: true },
      })
      expect(res.headers.getSetCookie()).toEqual([])
    }
  })

  it('セッション ID は予測できない（連続して発行した値が異なり、十分な長さがある）', async () => {
    const tenant = await makeTenant()
    const token = await makeJoinToken(tenant.id)
    const values = new Set<string>()
    for (let i = 0; i < 5; i++) {
      const res = await request(`/join/${tenant.id}?t=${token}`)
      values.add(attrsOf(res.headers.getSetCookie()[0] ?? '').value)
    }
    expect(values.size).toBe(5)
    for (const value of values) expect(value).toMatch(/^[A-Za-z0-9_-]{40,}$/)
  })
})

// ------------------------------------------------------------ ヘッダー

describe('すべての応答にセキュリティヘッダーが付く', () => {
  it('API・リダイレクト・エラー・画像・PDF・304・SPA・存在しないパス', async () => {
    const tenant = await makeTenant()
    const guest = await makeGuestSession(tenant.id, 'たろう')
    const { access, token: coupleToken } = await makeCoupleAccess(tenant.id)
    const couple = await makeCoupleSession(tenant.id, access.id)
    const photo = await seedPhoto(tenant.id, guest.guest.id)
    await seedSeatingChart(tenant.id)
    const menu = await seedMenuImage(tenant.id)
    const joinToken = await makeJoinToken(tenant.id)

    const base = `/api/t/${tenant.id}`
    const requests: [string, () => Promise<Response>][] = [
      ['GET /api/config', () => request('/api/config')],
      ['me 200', () => request(`${base}/me`, { cookie: guest.cookie })],
      ['me 401', () => request(`${base}/me`)],
      ['403 CSRF', () => request(`${base}/me/nickname`, { method: 'PUT', origin: null, cookie: guest.cookie })],
      ['api 404', () => request('/api/nothing')],
      ['photo 404', () => request(`${base}/photos/${crypto.randomUUID()}/thumb`, { cookie: guest.cookie })],
      ['thumb', () => request(`${base}/photos/${photo.id}/thumb`, { cookie: guest.cookie })],
      ['display', () => request(`${base}/photos/${photo.id}/display`, { cookie: guest.cookie })],
      ['original', () => request(`${base}/photos/${photo.id}/original?download=1`, { cookie: guest.cookie })],
      ['pdf', () => request(`${base}/seating-chart`, { cookie: guest.cookie })],
      ['menu image', () => request(`${base}/course-menu/images/${menu.id}`, { cookie: guest.cookie })],
      ['couple photos', () => request(`/api/couple/${tenant.id}/photos`, { cookie: couple.cookie })],
      ['couple image', () => request(`/api/couple/${tenant.id}/photos/${photo.id}/thumb`, { cookie: couple.cookie })],
      ['join redirect', () => request(`/join/${tenant.id}?t=${joinToken}`)],
      ['join error redirect', () => request(`/join/${tenant.id}?t=wrong`)],
      ['couple redirect', () => request(`/couple/${tenant.id}?t=${coupleToken}`)],
      ['couple error redirect', () => request(`/couple/${tenant.id}`)],
      ['spa /', () => request('/')],
      ['spa /t/x/home', () => request(`/t/${tenant.id}`)],
      ['spa /error', () => request('/error?code=TENANT_NOT_FOUND')],
      ['robots.txt', () => request('/robots.txt')],
    ]
    for (const [label, send] of requests) {
      expectSecurityHeaders(await send(), label)
    }

    const first = await request(`${base}/photos/${photo.id}/thumb`, { cookie: guest.cookie })
    const etag = first.headers.get('etag') ?? ''
    const cached = await request(`${base}/photos/${photo.id}/thumb`, {
      cookie: guest.cookie,
      headers: { 'If-None-Match': etag },
    })
    expect(cached.status).toBe(304)
    expectSecurityHeaders(cached, '304')
  })

  it('内部エラー（500）にも付き、内容を漏らさない', async () => {
    const brokenDb = {
      prepare() {
        throw new Error('SECRET internal detail nickname=たろう')
      },
      batch() {
        throw new Error('SECRET internal detail')
      },
    }
    const tenantId = crypto.randomUUID()
    const res = await app.request(
      `${ORIGIN}/api/t/${tenantId}/me`,
      { headers: { Cookie: `wym_g_${tenantId}=abc` } },
      { ...env, DB: brokenDb as unknown as D1Database },
    )
    expect(res.status).toBe(500)
    expectSecurityHeaders(res, '500')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const text = await res.text()
    expect(text).not.toContain('SECRET')
    expect(await JSON.parse(text).error.code).toBe('INTERNAL_ERROR')
  })
})

describe('キャッシュ', () => {
  it('個人情報を含む JSON（成功・エラー）は private, no-store', async () => {
    const tenant = await makeTenant()
    const guest = await makeGuestSession(tenant.id, 'たろう')
    const { access } = await makeCoupleAccess(tenant.id)
    const couple = await makeCoupleSession(tenant.id, access.id)
    await seedPhoto(tenant.id, guest.guest.id)
    const base = `/api/t/${tenant.id}`
    const cb = `/api/couple/${tenant.id}`
    const sends: Promise<Response>[] = [
      request('/api/config'),
      request(`${base}/me`, { cookie: guest.cookie }),
      request(`${base}/photos`, { cookie: guest.cookie }),
      request(`${base}/photos/ranking`, { cookie: guest.cookie }),
      request(`${base}/course-menu`, { cookie: guest.cookie }),
      request(`${base}/me`),
      request(`${base}/seating-chart`, { cookie: guest.cookie }),
      request(`${base}/me/nickname`, { method: 'PUT', origin: null, cookie: guest.cookie }),
      request(`${base}/me/nickname`, {
        method: 'PUT',
        cookie: guest.cookie,
        json: { nickname: 'あたらしい' },
      }),
      request(`${cb}/me`, { cookie: couple.cookie }),
      request(`${cb}/photos`, { cookie: couple.cookie }),
      request(`${cb}/photos/ranking`, { cookie: couple.cookie }),
      request(`${cb}/uploaders`, { cookie: couple.cookie }),
      request(`${cb}/login`),
      request('/api/nothing'),
    ]
    for (const res of await Promise.all(sends)) {
      expect(res.headers.get('content-type') ?? '').toContain('application/json')
      expect(res.headers.get('cache-control')).toBe('private, no-store')
    }
  })

  it('画像は長期キャッシュ（private, immutable）、席次表 PDF は no-cache のまま', async () => {
    const tenant = await makeTenant()
    const guest = await makeGuestSession(tenant.id, 'たろう')
    const photo = await seedPhoto(tenant.id, guest.guest.id)
    await seedSeatingChart(tenant.id)
    for (const variant of ['thumb', 'display', 'original']) {
      const res = await request(`/api/t/${tenant.id}/photos/${photo.id}/${variant}`, {
        cookie: guest.cookie,
      })
      expect(res.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    }
    const pdf = await request(`/api/t/${tenant.id}/seating-chart`, { cookie: guest.cookie })
    expect(pdf.headers.get('cache-control')).toBe('private, no-cache')
  })

  it('トークンを含む URL への応答（リダイレクト）は no-store', async () => {
    const tenant = await makeTenant()
    const token = await makeJoinToken(tenant.id)
    const { token: coupleToken } = await makeCoupleAccess(tenant.id)
    for (const path of [
      `/join/${tenant.id}?t=${token}`,
      `/join/${tenant.id}?t=bad`,
      `/couple/${tenant.id}?t=${coupleToken}`,
      `/couple/${tenant.id}`,
    ]) {
      expect((await request(path)).headers.get('cache-control'), path).toBe('no-store')
    }
  })
})

// ------------------------------------------------------------ 画像・PDF の配信

describe('画像・PDF の配信（Worker 経由のみ。URL を流用しても期間が終われば見られない）', () => {
  async function setup() {
    const tenant = await makeTenant()
    const guest = await makeGuestSession(tenant.id, 'たろう')
    const { access } = await makeCoupleAccess(tenant.id)
    const couple = await makeCoupleSession(tenant.id, access.id)
    const photo = await seedPhoto(tenant.id, guest.guest.id)
    await seedSeatingChart(tenant.id)
    const menu = await seedMenuImage(tenant.id)
    const g = `/api/t/${tenant.id}`
    const c = `/api/couple/${tenant.id}`
    const guestUrls = [
      `${g}/photos/${photo.id}/thumb`,
      `${g}/photos/${photo.id}/display`,
      `${g}/photos/${photo.id}/original`,
      `${g}/photos/${photo.id}/original?download=1`,
      `${g}/seating-chart`,
      `${g}/course-menu/images/${menu.id}`,
    ]
    const coupleUrls = [
      `${c}/photos/${photo.id}/thumb`,
      `${c}/photos/${photo.id}/display`,
      `${c}/photos/${photo.id}/original`,
      `${c}/photos/${photo.id}/original?download=1`,
    ]
    return { tenant, guest, couple, guestUrls, coupleUrls, photo, menu }
  }

  it('有効なセッションなら見られる（基準）', async () => {
    const { guest, couple, guestUrls, coupleUrls } = await setup()
    for (const url of guestUrls) expect((await request(url, { cookie: guest.cookie })).status, url).toBe(200)
    for (const url of coupleUrls) expect((await request(url, { cookie: couple.cookie })).status, url).toBe(200)
  })

  it('セッションがなければ拒否される（If-None-Match を付けても 304 にならない）', async () => {
    const { guestUrls, coupleUrls } = await setup()
    for (const url of [...guestUrls, ...coupleUrls]) {
      const res = await request(url, { headers: { 'If-None-Match': '"x"' } })
      expect(res.status, url).toBe(401)
      expect(res.headers.get('content-type')).toContain('application/json')
    }
  })

  it('他のテナントのセッションでは拒否される', async () => {
    const { tenant, guestUrls, coupleUrls } = await setup()
    const other = await makeTenant()
    const otherGuest = await makeGuestSession(other.id, 'ほか')
    const otherCouple = await makeCoupleAccess(other.id)
    const otherCoupleSession = await makeCoupleSession(other.id, otherCouple.access.id)
    for (const url of guestUrls) {
      const forged = `wym_g_${tenant.id}=${otherGuest.sessionId}`
      expect((await request(url, { cookie: otherGuest.cookie })).status, url).toBe(401)
      expect((await request(url, { cookie: forged })).status, url).toBe(401)
    }
    for (const url of coupleUrls) {
      const forged = `wym_c_${tenant.id}=${otherCoupleSession.sessionId}`
      expect((await request(url, { cookie: otherCoupleSession.cookie })).status, url).toBe(401)
      expect((await request(url, { cookie: forged })).status, url).toBe(401)
    }
  })

  it('他のテナントの URL（テナント ID を差し替え）は、自分のセッションでも NOT_FOUND', async () => {
    const { photo, menu } = await setup()
    const other = await makeTenant()
    const otherGuest = await makeGuestSession(other.id, 'ほか')
    await seedSeatingChart(other.id)
    const g = `/api/t/${other.id}`
    for (const url of [
      `${g}/photos/${photo.id}/thumb`,
      `${g}/photos/${photo.id}/original?download=1`,
      `${g}/course-menu/images/${menu.id}`,
    ]) {
      const res = await request(url, { cookie: otherGuest.cookie })
      expect(res.status, url).toBe(404)
    }
    // 自分のテナントの席次表は返るが、中身は自分のもの
    const pdf = await request(`${g}/seating-chart`, { cookie: otherGuest.cookie })
    expect(pdf.status).toBe(200)
  })

  it('参加者: 閲覧期間が終わると拒否される。新郎新婦は続けて見られ、期限切れで拒否される', async () => {
    const { tenant, guest, couple, guestUrls, coupleUrls } = await setup()
    await setTenant(tenant.id, { eventDate: eventDateOffset(EVENT.coupleOnly) })
    for (const url of guestUrls) {
      const res = await request(url, { cookie: guest.cookie, headers: { 'If-None-Match': '"x"' } })
      expect(res.status, url).toBe(403)
      expect(await errorCode(res)).toBe('PERIOD_ENDED')
    }
    for (const url of coupleUrls) {
      expect((await request(url, { cookie: couple.cookie })).status, url).toBe(200)
    }

    await setTenant(tenant.id, { eventDate: eventDateOffset(EVENT.expired) })
    for (const url of coupleUrls) {
      const res = await request(url, { cookie: couple.cookie })
      expect(res.status, url).toBe(403)
      expect(await errorCode(res)).toBe('PERIOD_ENDED')
    }
  })

  it('停止中は参加者も新郎新婦も拒否される。再開すると見られる', async () => {
    const { tenant, guest, couple, guestUrls, coupleUrls } = await setup()
    await setTenant(tenant.id, { suspended: true })
    for (const url of guestUrls) {
      expect(await errorCode(await request(url, { cookie: guest.cookie })), url).toBe('TENANT_SUSPENDED')
    }
    for (const url of coupleUrls) {
      expect(await errorCode(await request(url, { cookie: couple.cookie })), url).toBe('TENANT_SUSPENDED')
    }
    await setTenant(tenant.id, { suspended: false })
    expect((await request(guestUrls[0] ?? '', { cookie: guest.cookie })).status).toBe(200)
  })

  it('写真を削除したあとは、同じ URL で見られない', async () => {
    const { tenant, guest, photo } = await setup()
    const del = await request(`/api/t/${tenant.id}/photos/${photo.id}`, {
      method: 'DELETE',
      cookie: guest.cookie,
    })
    expect(del.status).toBe(204)
    const res = await request(`/api/t/${tenant.id}/photos/${photo.id}/original`, { cookie: guest.cookie })
    expect(res.status).toBe(404)
  })

  it('R2 のキーは URL に出ず、R2 のバケットは Worker からしか読めない（URL に tenants/ を含まない）', async () => {
    const { guest, tenant, photo } = await setup()
    const list = await request(`/api/t/${tenant.id}/photos`, { cookie: guest.cookie })
    const text = await list.text()
    expect(text).not.toContain('tenants/')
    expect(text).not.toContain(photo.keys.original)
  })

  it('Content-Type は保存時の形式どおり（JPEG・PNG・PDF）で、nosniff が付く', async () => {
    const tenant = await makeTenant()
    const guest = await makeGuestSession(tenant.id, 'たろう')
    const png = await seedPhoto(tenant.id, guest.guest.id, true)
    const jpeg = await seedPhoto(tenant.id, guest.guest.id, false)
    const chart = await seedSeatingChart(tenant.id)
    const menu = await seedMenuImage(tenant.id)
    const base = `/api/t/${tenant.id}`
    const cases: [string, string][] = [
      [`${base}/photos/${png.id}/original`, png.keys.original],
      [`${base}/photos/${png.id}/display`, png.keys.display],
      [`${base}/photos/${png.id}/thumb`, png.keys.thumb],
      [`${base}/photos/${jpeg.id}/original`, jpeg.keys.original],
      [`${base}/seating-chart`, chart.key],
      [`${base}/course-menu/images/${menu.id}`, menu.key],
    ]
    for (const [url, key] of cases) {
      const stored = await env.BUCKET.head(key)
      const res = await request(url, { cookie: guest.cookie })
      expect(res.headers.get('content-type'), url).toBe(stored?.httpMetadata?.contentType)
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    }
    expect(png.contentType).toBe('image/png')
    expect(jpeg.contentType).toBe('image/jpeg')
  })

  it('Content-Disposition のファイル名はサーバーが採番した ID と形式だけで決まる', async () => {
    const tenant = await makeTenant()
    const guest = await makeGuestSession(tenant.id, '"; filename="evil.html')
    const png = await seedPhoto(tenant.id, guest.guest.id, true)
    const jpeg = await seedPhoto(tenant.id, guest.guest.id, false)
    for (const [photo, ext] of [
      [png, 'png'],
      [jpeg, 'jpg'],
    ] as const) {
      const res = await request(`/api/t/${tenant.id}/photos/${photo.id}/original?download=1&filename=evil.html`, {
        cookie: guest.cookie,
      })
      expect(res.headers.get('content-disposition')).toBe(
        `attachment; filename="wedding-photo-${photo.id}.${ext}"`,
      )
    }
    // ダウンロード指定のない配信、display・thumb には Content-Disposition を付けない
    const inline = await request(`/api/t/${tenant.id}/photos/${png.id}/original`, { cookie: guest.cookie })
    expect(inline.headers.get('content-disposition')).toBeNull()
    const thumb = await request(`/api/t/${tenant.id}/photos/${png.id}/thumb?download=1`, { cookie: guest.cookie })
    expect(thumb.headers.get('content-disposition')).toBeNull()
  })
})

// ------------------------------------------------------------ ログ

describe('ログに個人情報を出さない', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('参加・ニックネーム・新郎新婦の入場・写真・エラーの一連の操作で、秘密の値が 1 つも出ない', async () => {
    const lines: string[] = []
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
      })
    }

    const tenant = await makeTenant()
    const joinToken = await makeJoinToken(tenant.id)
    const { token: coupleToken, access } = await makeCoupleAccess(tenant.id)
    const ip = '203.0.113.77'
    const nickname = 'ひみつのなまえ'

    // 参加 → ニックネーム登録 → 変更
    const joined = await request(`/join/${tenant.id}?t=${joinToken}`, { headers: { 'CF-Connecting-IP': ip } })
    const sessionCookie = joined.headers.getSetCookie()[0] ?? ''
    const sessionId = attrsOf(sessionCookie).value
    const cookie = `wym_g_${tenant.id}=${sessionId}`
    await request(`/api/t/${tenant.id}/me/nickname`, {
      method: 'PUT',
      cookie,
      headers: { 'CF-Connecting-IP': ip },
      json: { nickname, agreeToTerms: true },
    })
    await request(`/api/t/${tenant.id}/me/nickname`, {
      method: 'PUT',
      cookie,
      json: { nickname: `${nickname}2` },
    })
    const guest = await makeGuestSession(tenant.id, 'もうひとり')
    const photo = await seedPhoto(tenant.id, guest.guest.id)
    await request(`/api/t/${tenant.id}/photos`, { cookie })
    await request(`/api/t/${tenant.id}/photos/${photo.id}/like`, { method: 'PUT', cookie })
    await request(`/api/t/${tenant.id}/photos/${photo.id}`, { method: 'DELETE', cookie })
    await request(`/api/t/${tenant.id}/me`)
    await request(`/join/${tenant.id}?t=wrong-token-value`)

    // 新郎新婦: URL → 失敗 → ロック → 成功は別テナントで
    await request(`/couple/${tenant.id}?t=${coupleToken}`, { headers: { 'CF-Connecting-IP': ip } })
    const wrong = 'WRONGPW1'
    for (let i = 0; i < 6; i++) {
      await request(`/api/couple/${tenant.id}/login`, {
        method: 'POST',
        cookie: `wym_couple_pending=${coupleToken}`,
        json: { passcode: wrong, agreeToTerms: true },
      })
    }
    const other = await makeTenant()
    const otherAccess = await makeCoupleAccess(other.id)
    const ok = await request(`/api/couple/${other.id}/login`, {
      method: 'POST',
      cookie: `wym_couple_pending=${otherAccess.token}`,
      json: { passcode: PASSCODE, agreeToTerms: true },
    })
    const coupleSessionId = attrsOf(ok.headers.getSetCookie()[0] ?? '').value

    // 内部エラー（例外の message に秘密が入っていても出ない）
    const brokenDb = {
      prepare() {
        throw new Error(`SECRET-IN-ERROR ${nickname} ${joinToken}`)
      },
      batch() {
        throw new Error('SECRET-IN-ERROR')
      },
    }
    await app.request(
      `${ORIGIN}/api/t/${tenant.id}/me`,
      { headers: { Cookie: cookie, 'CF-Connecting-IP': ip } },
      { ...env, DB: brokenDb as unknown as D1Database },
    )

    const output = lines.join('\n')
    expect(output.length).toBeGreaterThan(0)
    expect(output).toContain(tenant.id)
    const secrets: [string, string][] = [
      ['ニックネーム', nickname],
      ['別のニックネーム', 'もうひとり'],
      ['テナント名', tenant.name],
      ['参加トークン', joinToken],
      ['新郎新婦用トークン', coupleToken],
      ['誤ったトークン', 'wrong-token-value'],
      ['パスコード', PASSCODE],
      ['誤ったパスコード', wrong],
      ['パスコードのハッシュ', access.passcodeHash],
      ['セッション ID', sessionId],
      ['新郎新婦のセッション ID', coupleSessionId],
      ['セッション ID のハッシュ', await sha256Hex(sessionId)],
      ['IP アドレス', ip],
      ['例外の message', 'SECRET-IN-ERROR'],
      ['管理者のメールアドレス', 'admin@example.com'],
      ['Cookie', 'wym_g_'],
    ]
    for (const [label, secret] of secrets) {
      expect(output.includes(secret), `ログに${label}が含まれている`).toBe(false)
    }
  })

  it('ログの各行は JSON で、渡せる項目が決まっている（許可した項目だけ）', async () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]))
    })
    const tenant = await makeTenant()
    const guest = await makeGuestSession(tenant.id, 'たろう')
    await request(`/api/t/${tenant.id}/me`, { cookie: guest.cookie })
    const allowed = new Set(['level', 'event', 'tenantId', 'code', 'status', 'method', 'path', 'durationMs', 'errorName'])
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      for (const key of Object.keys(JSON.parse(line))) expect(allowed.has(key), key).toBe(true)
    }
  })
})
