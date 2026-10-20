// 全エンドポイントの認可の表・Cookie・ヘッダー・配信・ログ（T18）。
// ルートの一覧は Hono の登録から作り、新しいルートが増えたら ROUTES への追加を忘れないようにする。
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/worker/app'
import { adminRawRequest, fakePdf, imageForm, newGuest, newPhoto, newTenant } from './fixtures'
import {
  ADMIN_EMAIL,
  adminRequest,
  createSession,
  db,
  ORIGIN,
  request,
  resetStorage,
  testEnv,
} from './helpers'

beforeEach(resetStorage)
afterEach(() => vi.restoreAllMocks())

/** auth: Better Auth に任せる。tenant: URL にテナント ID を含む。plain: テナントなし */
type Kind = 'auth' | 'plain' | 'tenant'

const ROUTES: Record<string, Kind> = {
  'GET /api/auth/*': 'auth',
  'POST /api/auth/*': 'auth',
  'GET /api/me': 'plain',
  'GET /api/tenants': 'plain',
  'POST /api/tenants': 'plain',
  'GET /api/tenants/:tenantId': 'tenant',
  'PATCH /api/tenants/:tenantId': 'tenant',
  'POST /api/tenants/:tenantId/deletion': 'tenant',
  'PUT /api/tenants/:tenantId/seating-chart': 'tenant',
  'GET /api/tenants/:tenantId/seating-chart': 'tenant',
  'GET /api/tenants/:tenantId/course-menu': 'tenant',
  'POST /api/tenants/:tenantId/course-menu/images': 'tenant',
  'GET /api/tenants/:tenantId/course-menu/images/:imageId': 'tenant',
  'DELETE /api/tenants/:tenantId/course-menu/images/:imageId': 'tenant',
  'PUT /api/tenants/:tenantId/course-menu/order': 'tenant',
  'GET /api/tenants/:tenantId/join-url': 'tenant',
  'POST /api/tenants/:tenantId/join-url': 'tenant',
  'GET /api/tenants/:tenantId/couple-access': 'tenant',
  'POST /api/tenants/:tenantId/couple-access': 'tenant',
  'GET /api/tenants/:tenantId/photos': 'tenant',
  'DELETE /api/tenants/:tenantId/photos/:photoId': 'tenant',
  'GET /api/tenants/:tenantId/photos/:photoId/:kind{thumb|display|original}': 'tenant',
  'GET /api/tenants/:tenantId/guests': 'tenant',
  'PATCH /api/tenants/:tenantId/guests/:guestId': 'tenant',
}

const API_ROUTES = Object.entries(ROUTES).filter(([, kind]) => kind !== 'auth')
const TENANT_ROUTES = Object.entries(ROUTES).filter(([, kind]) => kind === 'tenant')
const MUTATING = API_ROUTES.filter(([key]) => !key.startsWith('GET '))

/** GET には本文を付けられない */
const bodyFor = (method: string) => (method === 'GET' ? undefined : {})

const EVIL = 'https://evil.example'

function parse(key: string) {
  const [method = '', pattern = ''] = key.split(' ')
  return { method, pattern }
}

function fill(pattern: string, tenantId: string): string {
  return pattern
    .replace(':tenantId', tenantId)
    .replace(':photoId', crypto.randomUUID())
    .replace(':imageId', crypto.randomUUID())
    .replace(':guestId', crypto.randomUUID())
    .replace(/:kind\{[^}]*\}/, 'thumb')
}

async function errorCode(res: Response): Promise<string> {
  return (await res.json<{ error: { code: string } }>()).error.code
}

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

describe('ルートの一覧', () => {
  it('登録されているルートがすべて表にあり、表に余分なものがない', () => {
    const registered = app.routes
      .filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} ${route.path}`)
    expect([...registered].sort()).toEqual(Object.keys(ROUTES).sort())
  })
})

describe('(a) 認証なし・無効なセッション', () => {
  it.each(API_ROUTES)('%s: セッションなしは UNAUTHENTICATED', async (key) => {
    const { method, pattern } = parse(key)
    const tenant = await newTenant()
    const res = await request(fill(pattern, tenant.id), { method, body: bodyFor(method) })
    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('UNAUTHENTICATED')
  })

  it.each(API_ROUTES)('%s: 参加者・新郎新婦の Cookie では UNAUTHENTICATED', async (key) => {
    const { method, pattern } = parse(key)
    const tenant = await newTenant()
    const cookie = `wym_g_${tenant.id}=abc; wym_c_${tenant.id}=abc; wym_couple_pending=abc`
    const res = await request(fill(pattern, tenant.id), { method, cookie, body: bodyFor(method) })
    expect(res.status).toBe(401)
  })

  it('署名の合わない・期限切れのセッションは全ルートで拒否される', async () => {
    const tenant = await newTenant()
    const good = await createSession()
    const tampered = `${good.cookie.slice(0, -6)}AAAAAA`
    const expired = await createSession(ADMIN_EMAIL, { expiresAt: new Date(Date.now() - 1000) })
    for (const [key] of API_ROUTES) {
      const { method, pattern } = parse(key)
      for (const cookie of [tampered, expired.cookie]) {
        const res = await request(fill(pattern, tenant.id), {
          method,
          cookie,
          body: bodyFor(method),
        })
        expect(res.status, key).toBe(401)
      }
    }
  })
})

describe('(b) 管理者ではないセッション', () => {
  it.each(API_ROUTES)('%s: 許可リストにないアカウントは FORBIDDEN', async (key) => {
    const { method, pattern } = parse(key)
    const tenant = await newTenant()
    const stranger = await createSession('stranger@example.com')
    const res = await request(fill(pattern, tenant.id), {
      method,
      cookie: stranger.cookie,
      body: bodyFor(method),
    })
    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('FORBIDDEN')
  })

  it.each(API_ROUTES)(
    '%s: メール未確認のアカウントは許可リストにあっても FORBIDDEN',
    async (key) => {
      const { method, pattern } = parse(key)
      const tenant = await newTenant()
      const unverified = await createSession('unverified@example.com', { emailVerified: false })
      const res = await request(fill(pattern, tenant.id), {
        method,
        cookie: unverified.cookie,
        body: bodyFor(method),
        env: testEnv({ ADMIN_EMAILS: `unverified@example.com,${ADMIN_EMAIL}` }),
      })
      expect(res.status).toBe(403)
    },
  )

  it('許可リストが空なら誰も入れない', async () => {
    const session = await createSession()
    const res = await request('/api/tenants', {
      cookie: session.cookie,
      env: testEnv({ ADMIN_EMAILS: '' }),
    })
    expect(res.status).toBe(403)
  })

  it('許可リストから外れた管理者の既存セッションは、次のリクエストから使えない', async () => {
    const session = await createSession()
    expect((await request('/api/tenants', { cookie: session.cookie })).status).toBe(200)
    const res = await request('/api/tenants', {
      cookie: session.cookie,
      env: testEnv({ ADMIN_EMAILS: 'someone-else@example.com' }),
    })
    expect(res.status).toBe(403)
  })
})

describe('(c) テナントの状態', () => {
  // GET /api/tenants/:tenantId は、削除済み（dataDeletedAt あり）のテナントも一覧と同じく見せる仕様
  it.each(TENANT_ROUTES.filter(([key]) => key !== 'GET /api/tenants/:tenantId'))(
    '%s: データ削除済みのテナントは TENANT_NOT_FOUND',
    async (key) => {
      const { method, pattern } = parse(key)
      const tenant = await newTenant()
      await env.DB.prepare('UPDATE tenants SET data_deleted_at = ? WHERE id = ?')
        .bind(Date.now(), tenant.id)
        .run()
      const res = await adminRequest(fill(pattern, tenant.id), { method, body: bodyFor(method) })
      expect(res.status).toBe(404)
      expect(await errorCode(res)).toBe('TENANT_NOT_FOUND')
    },
  )

  it.each(TENANT_ROUTES)(
    '%s: UUID でない・存在しないテナント ID は TENANT_NOT_FOUND',
    async (key) => {
      const { method, pattern } = parse(key)
      const session = await createSession()
      for (const id of ['not-a-uuid', crypto.randomUUID()]) {
        const res = await request(fill(pattern, id), {
          method,
          cookie: session.cookie,
          body: bodyFor(method),
        })
        expect(res.status, `${key} ${id}`).toBe(404)
        expect(await errorCode(res)).toBe('TENANT_NOT_FOUND')
      }
    },
  )

  it('停止中のテナントも管理者は操作できる（P8: 管理者はテナント横断）', async () => {
    const tenant = await newTenant()
    await env.DB.prepare('UPDATE tenants SET suspended = 1 WHERE id = ?').bind(tenant.id).run()
    expect((await adminRequest(`/api/tenants/${tenant.id}`)).status).toBe(200)
    expect((await adminRequest(`/api/tenants/${tenant.id}/guests`)).status).toBe(200)
  })
})

describe('(d) CSRF（状態を変えるリクエスト）', () => {
  it('GET 以外の API ルートが存在する（表の取りこぼし防止）', () => {
    expect(MUTATING.length).toBeGreaterThanOrEqual(10)
  })

  it.each(MUTATING)(
    '%s: Origin がない・別オリジンなら FORBIDDEN（有効な管理者セッションがあっても）',
    async (key) => {
      const { method, pattern } = parse(key)
      const tenant = await newTenant()
      const session = await createSession()
      for (const origin of [null, EVIL, 'http://localhost:5175', `${EVIL}/${ORIGIN}`]) {
        const res = await request(fill(pattern, tenant.id), {
          method,
          cookie: session.cookie,
          origin,
          body: { name: 'x', eventDate: '2026-10-31', confirmName: 'テスト' },
        })
        expect(res.status, `${key} origin=${origin}`).toBe(403)
        expect(await errorCode(res)).toBe('FORBIDDEN')
      }
    },
  )

  it('別オリジンからのテナント作成・削除は実行されない', async () => {
    const tenant = await newTenant()
    const session = await createSession()
    await request('/api/tenants', {
      method: 'POST',
      cookie: session.cookie,
      origin: EVIL,
      body: { name: '乗っ取り', eventDate: '2026-10-31' },
    })
    await request(`/api/tenants/${tenant.id}/deletion`, {
      method: 'POST',
      cookie: session.cookie,
      origin: EVIL,
      body: { confirmName: 'テスト' },
    })
    const list = await request('/api/tenants', { cookie: session.cookie })
    const body = await list.json<{
      tenants: { id: string; name: string; dataDeletedAt: string | null }[]
    }>()
    expect(body.tenants).toHaveLength(1)
    expect(body.tenants[0]?.dataDeletedAt).toBeNull()
  })

  it('Better Auth の POST も、別オリジンからは拒否される（ログアウトできない）', async () => {
    const session = await createSession()
    const res = await app.request(
      `${ORIGIN}/api/auth/sign-out`,
      {
        method: 'POST',
        headers: { Cookie: session.cookie, Origin: EVIL, 'Content-Type': 'application/json' },
        body: '{}',
      },
      testEnv(),
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect((await request('/api/me', { cookie: session.cookie })).status).toBe(200)
  })
})

describe('Cookie（Better Auth）', () => {
  it('Google ログインの開始で発行する Cookie は HttpOnly・SameSite=Lax・Path=/・ドメインなし', async () => {
    const res = await app.request(
      `${ORIGIN}/api/auth/sign-in/social`,
      {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
      },
      testEnv(),
    )
    const cookies = res.headers.getSetCookie()
    expect(cookies.length).toBeGreaterThan(0)
    for (const cookie of cookies) {
      const attrs = cookie.split(';').map((a) => a.trim().toLowerCase())
      expect(attrs, cookie).toContain('httponly')
      expect(attrs, cookie).toContain('samesite=lax')
      expect(attrs, cookie).toContain('path=/')
      expect(
        attrs.some((a) => a.startsWith('domain')),
        cookie,
      ).toBe(false)
    }
  })

  it('本番（https）のオリジンでは Secure が付く', async () => {
    const httpsEnv = testEnv({ ADMIN_ORIGIN: 'https://admin.would-you-marry.me' })
    const res = await app.request(
      'https://admin.would-you-marry.me/api/auth/sign-in/social',
      {
        method: 'POST',
        headers: {
          Origin: 'https://admin.would-you-marry.me',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
      },
      httpsEnv,
    )
    const cookies = res.headers.getSetCookie()
    expect(cookies.length).toBeGreaterThan(0)
    for (const cookie of cookies) {
      expect(cookie.toLowerCase(), cookie).toContain('secure')
      expect(cookie, cookie).toMatch(/^__Secure-/)
    }
  })
})

describe('ヘッダーとキャッシュ', () => {
  it('API（成功・エラー）・Better Auth・画像・PDF・SPA のすべてにセキュリティヘッダーが付く', async () => {
    const tenant = await newTenant()
    const guest = await newGuest(tenant.id, 'たろう')
    const photo = await newPhoto(tenant.id, guest.id)
    await adminRawRequest(`/api/tenants/${tenant.id}/seating-chart`, {
      method: 'PUT',
      body: fakePdf(),
      headers: { 'Content-Type': 'application/pdf' },
    })
    const session = await createSession()
    // テストの環境には静的アセットがないので、SPA の応答は代わりのものを用意する
    const withAssets = testEnv({
      ASSETS: { fetch: async () => new Response('<!doctype html>') } as unknown as Fetcher,
    })
    const sends: [string, Response | Promise<Response>][] = [
      ['me', request('/api/me', { cookie: session.cookie })],
      ['401', request('/api/me')],
      [
        '403 csrf',
        request('/api/tenants', { method: 'POST', cookie: session.cookie, origin: null, body: {} }),
      ],
      ['404', request('/api/nothing', { cookie: session.cookie })],
      ['tenant 404', request(`/api/tenants/${crypto.randomUUID()}`, { cookie: session.cookie })],
      [
        'thumb',
        request(`/api/tenants/${tenant.id}/photos/${photo.id}/thumb`, { cookie: session.cookie }),
      ],
      [
        'original',
        request(`/api/tenants/${tenant.id}/photos/${photo.id}/original?download=1`, {
          cookie: session.cookie,
        }),
      ],
      ['pdf', request(`/api/tenants/${tenant.id}/seating-chart`, { cookie: session.cookie })],
      ['auth session', request('/api/auth/get-session')],
      ['auth 404', request('/api/auth/nothing')],
      ['spa /', request('/', { env: withAssets })],
      ['spa /tenants', request('/tenants', { env: withAssets })],
      ['robots.txt', request('/robots.txt', { env: withAssets })],
    ]
    for (const [label, pending] of sends) expectSecurityHeaders(await pending, label)
  })

  it('個人情報・URL・パスコードを含む JSON は private, no-store（成功もエラーも）', async () => {
    const tenant = await newTenant()
    const guest = await newGuest(tenant.id, 'たろう')
    await newPhoto(tenant.id, guest.id)
    const session = await createSession()
    const paths = [
      '/api/me',
      '/api/tenants',
      `/api/tenants/${tenant.id}`,
      `/api/tenants/${tenant.id}/guests`,
      `/api/tenants/${tenant.id}/photos`,
      `/api/tenants/${tenant.id}/join-url`,
      `/api/tenants/${tenant.id}/couple-access`,
      `/api/tenants/${tenant.id}/course-menu`,
      '/api/nothing',
    ]
    for (const path of paths) {
      const res = await request(path, { cookie: session.cookie })
      expect(res.headers.get('cache-control'), path).toBe('private, no-store')
    }
    const unauth = await request('/api/me')
    expect(unauth.headers.get('cache-control')).toBe('private, no-store')
    const issued = await request(`/api/tenants/${tenant.id}/couple-access`, {
      method: 'POST',
      cookie: session.cookie,
      body: {},
    })
    expect(issued.headers.get('cache-control')).toBe('no-store')
    const joinUrl = await request(`/api/tenants/${tenant.id}/join-url`, {
      method: 'POST',
      cookie: session.cookie,
      body: {},
    })
    expect(joinUrl.headers.get('cache-control')).toBe('private, no-store')
    const session2 = await app.request(
      `${ORIGIN}/api/auth/get-session`,
      { headers: { Cookie: session.cookie } },
      testEnv(),
    )
    expect(session2.headers.get('cache-control') ?? '').toMatch(/no-store|no-cache|private/)
  })

  it('画像は長期キャッシュ（private, immutable）のまま', async () => {
    const tenant = await newTenant()
    const guest = await newGuest(tenant.id, 'たろう')
    const photo = await newPhoto(tenant.id, guest.id)
    const session = await createSession()
    for (const kind of ['thumb', 'display', 'original']) {
      const res = await request(`/api/tenants/${tenant.id}/photos/${photo.id}/${kind}`, {
        cookie: session.cookie,
      })
      expect(res.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    }
  })
})

describe('画像・PDF の配信', () => {
  it('セッションがなければ画像・PDF・コース表は見られない（If-None-Match を付けても 304 にならない）', async () => {
    const tenant = await newTenant()
    const guest = await newGuest(tenant.id, 'たろう')
    const photo = await newPhoto(tenant.id, guest.id)
    const base = `/api/tenants/${tenant.id}`
    await adminRawRequest(`${base}/seating-chart`, {
      method: 'PUT',
      body: fakePdf(),
      headers: { 'Content-Type': 'application/pdf' },
    })
    for (const path of [
      `${base}/photos/${photo.id}/thumb`,
      `${base}/photos/${photo.id}/display`,
      `${base}/photos/${photo.id}/original?download=1`,
      `${base}/seating-chart`,
    ]) {
      const res = await request(path, { headers: { 'If-None-Match': '"x"' } })
      expect(res.status, path).toBe(401)
    }
  })

  it('Content-Type は保存時の形式どおり。ダウンロードのファイル名は ID と形式だけで決まる', async () => {
    const tenant = await newTenant()
    const guest = await newGuest(tenant.id, '"; filename="evil.html')
    const png = await newPhoto(tenant.id, guest.id, { contentType: 'image/png' })
    const jpeg = await newPhoto(tenant.id, guest.id)
    const base = `/api/tenants/${tenant.id}`
    const session = await createSession()
    await adminRawRequest(`${base}/seating-chart`, {
      method: 'PUT',
      body: fakePdf(),
      headers: { 'Content-Type': 'application/pdf' },
    })
    await adminRawRequest(`${base}/course-menu/images`, {
      method: 'POST',
      body: imageForm(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]),
        'a.png',
      ),
    })

    const cases: [string, string][] = [
      [`${base}/photos/${png.id}/original`, png.keys.original],
      [`${base}/photos/${png.id}/display`, png.keys.display],
      [`${base}/photos/${png.id}/thumb`, png.keys.thumb],
      [`${base}/photos/${jpeg.id}/original`, jpeg.keys.original],
    ]
    for (const [path, key] of cases) {
      const stored = await env.BUCKET.head(key)
      const res = await request(path, { cookie: session.cookie })
      expect(res.headers.get('content-type'), path).toBe(stored?.httpMetadata?.contentType)
    }
    const pdf = await request(`${base}/seating-chart`, { cookie: session.cookie })
    expect(pdf.headers.get('content-type')).toBe('application/pdf')

    for (const [photo, ext] of [
      [png, 'png'],
      [jpeg, 'jpg'],
    ] as const) {
      const res = await request(
        `${base}/photos/${photo.id}/original?download=1&filename=evil.html`,
        {
          cookie: session.cookie,
        },
      )
      expect(res.headers.get('content-disposition')).toBe(
        `attachment; filename="wedding-photo-${photo.id}.${ext}"`,
      )
    }
  })

  it('他のテナントの写真 ID・画像 ID・参加者 ID を指定しても、変更も閲覧もできない', async () => {
    const a = await newTenant()
    const b = await newTenant()
    const guestA = await newGuest(a.id, 'あ')
    const photoA = await newPhoto(a.id, guestA.id)
    const session = await createSession()
    for (const [method, path] of [
      ['GET', `/api/tenants/${b.id}/photos/${photoA.id}/thumb`],
      ['GET', `/api/tenants/${b.id}/photos/${photoA.id}/original?download=1`],
      ['DELETE', `/api/tenants/${b.id}/photos/${photoA.id}`],
      ['PATCH', `/api/tenants/${b.id}/guests/${guestA.id}`],
    ] as const) {
      const res = await request(path, {
        method,
        cookie: session.cookie,
        body: method === 'GET' ? undefined : { nickname: 'のっとり' },
      })
      expect(res.status, `${method} ${path}`).toBe(404)
    }
    const list = await request(`/api/tenants/${a.id}/photos`, { cookie: session.cookie })
    expect((await list.json<{ photos: unknown[] }>()).photos).toHaveLength(1)
    const guests = await request(`/api/tenants/${a.id}/guests`, { cookie: session.cookie })
    expect((await guests.json<{ guests: { nickname: string }[] }>()).guests[0]?.nickname).toBe('あ')
  })
})

describe('ログに個人情報を出さない', () => {
  it('テナント作成・URL 発行・名前変更・削除・内部エラーの一連の操作で、秘密の値が出ない', async () => {
    const lines: string[] = []
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
      })
    }
    const session = await createSession()
    const tenantName = 'ひみつの結婚式'
    const create = await request('/api/tenants', {
      method: 'POST',
      cookie: session.cookie,
      body: { name: tenantName, eventDate: '2026-10-31' },
    })
    const { tenant } = await create.json<{ tenant: { id: string } }>()
    const joinUrl = await request(`/api/tenants/${tenant.id}/join-url`, {
      method: 'POST',
      cookie: session.cookie,
      body: {},
    })
    const joinToken =
      new URL((await joinUrl.json<{ url: string }>()).url).searchParams.get('t') ?? ''
    const couple = await request(`/api/tenants/${tenant.id}/couple-access`, {
      method: 'POST',
      cookie: session.cookie,
      body: {},
    })
    const { url: coupleUrl, passcode } = await couple.json<{ url: string; passcode: string }>()
    const coupleToken = new URL(coupleUrl).searchParams.get('t') ?? ''
    const guest = await newGuest(tenant.id, 'ひみつのなまえ')
    await request(`/api/tenants/${tenant.id}/guests/${guest.id}`, {
      method: 'PATCH',
      cookie: session.cookie,
      body: { nickname: 'あたらしいなまえ' },
    })
    await request(`/api/tenants/${tenant.id}`, {
      method: 'PATCH',
      cookie: session.cookie,
      body: { suspended: true },
    })
    await request('/api/me', { cookie: 'x=y', headers: { 'CF-Connecting-IP': '203.0.113.5' } })
    await request(`/api/tenants/${tenant.id}/deletion`, {
      method: 'POST',
      cookie: session.cookie,
      body: { confirmName: tenantName },
    })
    const stranger = await createSession('stranger@example.com')
    await request('/api/tenants', { cookie: stranger.cookie })

    // 内部エラー: 例外の message に秘密が入っていても出ない
    const brokenDb = {
      prepare() {
        throw new Error(`SECRET-IN-ERROR ${ADMIN_EMAIL} ${joinToken}`)
      },
      batch() {
        throw new Error('SECRET-IN-ERROR')
      },
    }
    await app.request(
      `${ORIGIN}/api/tenants`,
      { headers: { Cookie: session.cookie } },
      {
        ...env,
        ADMIN_EMAILS: ADMIN_EMAIL,
        ADMIN_ORIGIN: ORIGIN,
        DB: brokenDb as unknown as D1Database,
      },
    )

    // 定期処理
    const { deleteExpiredTenants } = await import('../src/worker/jobs/delete-expired-tenants')
    await deleteExpiredTenants(env, new Date('2030-01-01T00:00:00Z'))

    const output = lines.join('\n')
    expect(output.length).toBeGreaterThan(0)
    expect(output).toContain(tenant.id)
    const secrets: [string, string][] = [
      ['管理者のメールアドレス', ADMIN_EMAIL],
      ['許可されていないメールアドレス', 'stranger@example.com'],
      ['テナント名', tenantName],
      ['参加トークン', joinToken],
      ['新郎新婦用トークン', coupleToken],
      ['パスコード', passcode],
      ['ニックネーム', 'ひみつのなまえ'],
      ['変更後のニックネーム', 'あたらしいなまえ'],
      ['セッションのトークン', session.token],
      ['IP アドレス', '203.0.113.5'],
      ['例外の message', 'SECRET-IN-ERROR'],
    ]
    for (const [label, secret] of secrets) {
      expect(output.includes(secret), `ログに${label}が含まれている`).toBe(false)
    }
    // 監査ログ（D1）には操作した管理者が残る（NFR-19）が、トークン・パスコードは入らない
    const audit = await env.DB.prepare('SELECT actor, detail FROM audit_logs').all<{
      actor: string
      detail: string | null
    }>()
    expect(audit.results.some((row) => row.actor === ADMIN_EMAIL)).toBe(true)
    const auditText = JSON.stringify(audit.results)
    for (const secret of [joinToken, coupleToken, passcode]) expect(auditText).not.toContain(secret)
  })
})

void db
