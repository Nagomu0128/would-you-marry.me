import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_DENIED_CODE, isAllowedEmail, parseAllowlist } from '../src/worker/auth'
import {
  ADMIN_EMAIL,
  adminRequest,
  createSession,
  ORIGIN,
  request,
  resetStorage,
  testEnv,
} from './helpers'

beforeEach(resetStorage)
afterEach(() => vi.restoreAllMocks())

describe('許可リスト', () => {
  it('前後の空白を除き、小文字で比較する', () => {
    expect(parseAllowlist(' A@Example.com , b@example.com ,, ')).toEqual([
      'a@example.com',
      'b@example.com',
    ])
    expect(isAllowedEmail('a@example.com', ' A@EXAMPLE.com ')).toBe(true)
    expect(isAllowedEmail('a@example.com', 'c@example.com')).toBe(false)
    expect(isAllowedEmail('', '')).toBe(false)
  })
})

describe('GET /api/me', () => {
  it('セッションなしは 401 UNAUTHENTICATED', async () => {
    const res = await request('/api/me')
    expect(res.status).toBe(401)
    expect((await res.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    })
  })

  it('署名の合わない Cookie は 401', async () => {
    const s = await createSession()
    const res = await request('/api/me', { cookie: `${s.cookie.slice(0, -6)}AAAAAA` })
    expect(res.status).toBe(401)
  })

  it('許可リストにないメールは 403 FORBIDDEN', async () => {
    const s = await createSession('stranger@example.com')
    const res = await request('/api/me', { cookie: s.cookie })
    expect(res.status).toBe(403)
    expect((await res.json()) as { error: { code: string } }).toMatchObject({
      error: { code: 'FORBIDDEN' },
    })
  })

  it('メール未確認は 403', async () => {
    const s = await createSession('unverified@example.com', { emailVerified: false })
    const res = await request('/api/me', {
      cookie: s.cookie,
      env: testEnv({ ADMIN_EMAILS: 'unverified@example.com' }),
    })
    expect(res.status).toBe(403)
  })

  it('許可リストにあれば 200 で email と name を返す', async () => {
    const res = await adminRequest('/api/me')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ email: ADMIN_EMAIL, name: 'Test Admin' })
  })

  it('許可リストから外した直後に 403 になる', async () => {
    const s = await createSession()
    expect((await request('/api/me', { cookie: s.cookie })).status).toBe(200)
    const res = await request('/api/me', {
      cookie: s.cookie,
      env: testEnv({ ADMIN_EMAILS: 'someone-else@example.com' }),
    })
    expect(res.status).toBe(403)
  })

  it('期限切れのセッションは 401', async () => {
    const s = await createSession(ADMIN_EMAIL, { expiresAt: new Date(Date.now() - 1000) })
    expect((await request('/api/me', { cookie: s.cookie })).status).toBe(401)
  })
})

describe('CSRF と共通ヘッダー', () => {
  it('状態を変えるリクエストは Origin が一致しなければ 403', async () => {
    const s = await createSession()
    const body = { name: 'x', eventDate: '2030-01-01' }
    const bad = await request('/api/tenants', {
      method: 'POST',
      body,
      cookie: s.cookie,
      origin: 'https://evil.example',
    })
    expect(bad.status).toBe(403)
    const missing = await request('/api/tenants', {
      method: 'POST',
      body,
      cookie: s.cookie,
      origin: null,
    })
    expect(missing.status).toBe(403)
    const ok = await request('/api/tenants', { method: 'POST', body, cookie: s.cookie })
    expect(ok.status).toBe(201)
  })

  it('すべてのレスポンスにセキュリティヘッダーが付く', async () => {
    for (const res of [
      await request('/api/me'),
      await adminRequest('/api/me'),
      await request('/api/does-not-exist'),
    ]) {
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(res.headers.get('Referrer-Policy')).toBe('same-origin')
      expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    }
  })
})

// --- Google ログインのフロー（Google への通信だけを差し替える） ---

function jwt(claims: Record<string, unknown>): string {
  const enc = (v: unknown) => btoa(JSON.stringify(v)).replaceAll('=', '')
  return `${enc({ alg: 'none' })}.${enc(claims)}.sig`
}

function mockGoogle(claims: Record<string, unknown>) {
  const realFetch = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return Response.json({
        access_token: 'at',
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: jwt(claims),
      })
    }
    return realFetch(input, init)
  })
}

function cookiesOf(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
}

/** ログイン開始 → Google からのコールバックまでを実行し、コールバックのレスポンスを返す */
async function loginWithGoogle(email: string, emailVerified = true): Promise<Response> {
  mockGoogle({ sub: `sub-${email}`, email, email_verified: emailVerified, name: 'G User' })
  const start = await request('/api/auth/sign-in/social', {
    method: 'POST',
    body: { provider: 'google', callbackURL: '/', errorCallbackURL: '/login?error=denied' },
  })
  expect(start.status).toBe(200)
  const { url } = (await start.json()) as { url: string }
  const state = new URL(url).searchParams.get('state')
  expect(state).toBeTruthy()
  const res = await app_callback(state ?? '', cookiesOf(start))
  return res
}

async function app_callback(state: string, cookie: string): Promise<Response> {
  return request(`/api/auth/callback/google?code=abc&state=${state}`, { cookie })
}

async function countRows(table: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>()
  return row?.n ?? 0
}

describe('Google ログイン（Better Auth）', () => {
  it('許可リストにあるメールはログインでき、/api/me が使える', async () => {
    const res = await loginWithGoogle(ADMIN_EMAIL)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    const cookie = cookiesOf(res)
    expect(cookie).toContain('better-auth.session_token=')
    const me = await request('/api/me', { cookie })
    expect(me.status).toBe(200)
    expect(((await me.json()) as { email: string }).email).toBe(ADMIN_EMAIL)
  })

  it('user.create フック: 許可リストにないメールは拒否され、/login?error=denied に戻る', async () => {
    const res = await loginWithGoogle('stranger@example.com')
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location.startsWith('/login?error=denied')).toBe(true)
    // 画面は searchParams.get('error') で最初の値（denied）を読む
    expect(new URL(location, ORIGIN).searchParams.get('error')).toBe('denied')
    expect(location).toContain(ADMIN_DENIED_CODE)
    expect(await countRows('auth_user')).toBe(0)
    expect(await countRows('auth_session')).toBe(0)
    expect(cookiesOf(res)).not.toContain('session_token')
  })

  it('user.create フック: メール未確認は拒否される', async () => {
    const res = await loginWithGoogle(ADMIN_EMAIL, false)
    expect((res.headers.get('location') ?? '').startsWith('/login?error=denied')).toBe(true)
    expect(await countRows('auth_user')).toBe(0)
  })

  it('session.create フック: 許可リストから外れた既存ユーザーのログインは拒否される', async () => {
    // 先に許可リストにある状態でログインしておく
    expect((await loginWithGoogle(ADMIN_EMAIL)).headers.get('location')).toBe('/')
    expect(await countRows('auth_user')).toBe(1)
    expect(await countRows('auth_session')).toBe(1)

    // 許可リストから外す（auth はリクエストごとに env から作られる）
    const strictEnv = testEnv({ ADMIN_EMAILS: 'other@example.com' })
    mockGoogle({ sub: `sub-${ADMIN_EMAIL}`, email: ADMIN_EMAIL, email_verified: true })
    const start = await request('/api/auth/sign-in/social', {
      method: 'POST',
      body: { provider: 'google', callbackURL: '/', errorCallbackURL: '/login?error=denied' },
      env: strictEnv,
    })
    const state = new URL(((await start.json()) as { url: string }).url).searchParams.get('state')
    const res = await request(`/api/auth/callback/google?code=abc&state=${state}`, {
      cookie: cookiesOf(start),
      env: strictEnv,
    })
    expect((res.headers.get('location') ?? '').startsWith('/login?error=denied')).toBe(true)
    expect(cookiesOf(res)).not.toContain('session_token')
    expect(await countRows('auth_session')).toBe(1)
  })

  it('メールアドレスとパスワードのログインは使えない', async () => {
    const res = await request('/api/auth/sign-in/email', {
      method: 'POST',
      body: { email: ADMIN_EMAIL, password: 'password1234' },
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await countRows('auth_user')).toBe(0)
  })
})
