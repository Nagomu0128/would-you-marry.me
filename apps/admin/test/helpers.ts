import { env } from 'cloudflare:workers'
import { createDb, schema } from '@wym/db'
import { app } from '../src/worker/app'
import type { AppEnv } from '../src/worker/types'

export const ORIGIN = 'http://localhost:5174'
export const ADMIN_EMAIL = 'admin@example.com'

export const db = createDb(env.DB)

/** テスト用の環境。許可リストなどを差し替えられる */
export function testEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return { ...env, ADMIN_EMAILS: ADMIN_EMAIL, ADMIN_ORIGIN: ORIGIN, ...overrides }
}

/** テスト間でデータを引き継がないよう、D1 と R2 を空にする */
export async function resetStorage(): Promise<void> {
  await env.DB.batch(
    [
      'likes',
      'photos',
      'visitor_sessions',
      'guests',
      'join_tokens',
      'couple_accesses',
      'seating_charts',
      'course_menu_images',
      'audit_logs',
      'tenants',
      'auth_session',
      'auth_account',
      'auth_verification',
      'auth_user',
    ].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
  )
  const listed = await env.BUCKET.list()
  if (listed.objects.length > 0) await env.BUCKET.delete(listed.objects.map((o) => o.key))
}

function base64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

/**
 * Better Auth と同じ形式で署名したセッション Cookie の値を作る。
 * better-call の signCookieValue: encodeURIComponent(`${値}.${HMAC-SHA256(値, secret) の base64}`)
 */
export async function signCookieValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return encodeURIComponent(`${value}.${base64(signature)}`)
}

/** ADMIN_ORIGIN が http のときの Cookie 名（https なら `__Secure-` が付く） */
export const SESSION_COOKIE_NAME = 'better-auth.session_token'

export type TestSession = { cookie: string; userId: string; token: string }

/**
 * auth_user と auth_session の行を入れ、そのセッションの Cookie ヘッダーを返す。
 * 既に同じメールのユーザーがいればそれを使う。
 */
export async function createSession(
  email: string = ADMIN_EMAIL,
  options: { emailVerified?: boolean; expiresAt?: Date } = {},
): Promise<TestSession> {
  const existing = await env.DB.prepare('SELECT id FROM auth_user WHERE email = ?')
    .bind(email)
    .first<{ id: string }>()
  const userId = existing?.id ?? crypto.randomUUID()
  if (!existing) {
    await db.insert(schema.authUser).values({
      id: userId,
      name: 'Test Admin',
      email,
      emailVerified: options.emailVerified ?? true,
    })
  }
  const token = crypto.randomUUID().replaceAll('-', '')
  await db.insert(schema.authSession).values({
    id: crypto.randomUUID(),
    userId,
    token,
    expiresAt: options.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    updatedAt: new Date(),
  })
  const signed = await signCookieValue(token, env.BETTER_AUTH_SECRET)
  return { cookie: `${SESSION_COOKIE_NAME}=${signed}`, userId, token }
}

type RequestOptions = {
  method?: string
  body?: unknown
  /** Cookie ヘッダー（createSession の cookie） */
  cookie?: string
  /** Origin ヘッダー。既定は ADMIN_ORIGIN（状態を変えるリクエストのみ付ける） */
  origin?: string | null
  env?: AppEnv
}

/** Worker にリクエストを送る */
export function request(path: string, options: RequestOptions = {}): Response | Promise<Response> {
  const method = options.method ?? 'GET'
  const headers = new Headers()
  if (options.cookie) headers.set('Cookie', options.cookie)
  const origin = options.origin === undefined ? ORIGIN : options.origin
  if (origin !== null && method !== 'GET') headers.set('Origin', origin)
  let body: string | undefined
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.body)
  }
  return app.request(`${ORIGIN}${path}`, { method, headers, body }, options.env ?? testEnv())
}

/** 管理者のセッションでリクエストを送る */
export async function adminRequest(
  path: string,
  options: Omit<RequestOptions, 'cookie'> = {},
  session?: TestSession,
): Promise<Response> {
  const s = session ?? (await createSession())
  return request(path, { ...options, cookie: s.cookie })
}
