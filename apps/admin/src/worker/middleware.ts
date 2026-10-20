import { ApiError } from '@wym/shared'
import { createMiddleware } from 'hono/factory'
import { createAuth, isAllowedEmail, normalizeEmail } from './auth'
import type { AppBindings } from './types'

/** すべてのレスポンスに付けるヘッダー（静的アセットは public/_headers で同じものを付ける） */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
}

/** 個人情報を含む JSON の応答 */
export const API_CACHE_CONTROL = 'private, no-store'

export const securityHeaders = createMiddleware<AppBindings>(async (c, next) => {
  await next()
  // 静的アセットやリダイレクトの Response はヘッダーを変更できないので、作り直して付ける
  const res = new Response(c.res.body, c.res)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.headers.set(name, value)
  // API の応答（メールアドレスや URL を含む JSON、エラー）は、ブラウザや中間のキャッシュに残さない。
  // 画像・PDF は自分で Cache-Control を付けるので、付いていないものだけに足す
  if (c.req.path.startsWith('/api/') && !res.headers.has('Cache-Control')) {
    res.headers.set('Cache-Control', API_CACHE_CONTROL)
  }
  c.res = res
})

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * `/api/auth/*` 以外の `/api/*` の共通処理。
 * Better Auth のセッションがあり、メールアドレスが許可リストにあることを、リクエストごとに確認する。
 * 状態を変えるリクエストは Origin がリクエストのオリジンと一致しなければ拒否する（CSRF 対策）。
 */
export const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) throw new ApiError('UNAUTHENTICATED', 'authentication required')

  const { email, emailVerified, name } = session.user
  if (!emailVerified || !isAllowedEmail(c.env.ADMIN_EMAILS, email)) {
    throw new ApiError('FORBIDDEN', 'not an admin')
  }

  if (!SAFE_METHODS.has(c.req.method)) {
    const origin = c.req.header('Origin')
    if (origin !== new URL(c.req.url).origin) throw new ApiError('FORBIDDEN', 'origin mismatch')
  }

  c.set('adminEmail', normalizeEmail(email))
  c.set('adminName', name || null)
  await next()
})
