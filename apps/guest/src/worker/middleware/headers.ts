import type { MiddlewareHandler } from 'hono'
import { logEvent } from '../lib/logger'
import type { AppEnv } from '../types'

/**
 * すべてのレスポンスに付けるヘッダー（NFR-15）。
 * 静的アセットには `public/_headers` で同じものを付けている。変えるときは両方を直すこと
 */
export const SECURITY_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
} as const

/** 個人情報を含む JSON の応答 */
export const API_CACHE_CONTROL = 'private, no-store'

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  // 静的アセット（ASSETS）のレスポンスはヘッダーを変更できないので、複製してから付ける
  const res = new Response(c.res.body, c.res)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.headers.set(name, value)
  // API の応答（個人情報を含む JSON やエラー）は、ブラウザや中間のキャッシュに残さない。
  // 画像・PDF は自分で Cache-Control を付けるので、付いていないものだけに足す
  if (c.req.path.startsWith('/api/') && !res.headers.has('Cache-Control')) {
    res.headers.set('Cache-Control', API_CACHE_CONTROL)
  }
  c.res = res
}

/** リクエストごとに 1 行のログを出す（クエリ文字列は出さない。参加トークンを含みうるため） */
export const requestLog: MiddlewareHandler<AppEnv> = async (c, next) => {
  const started = Date.now()
  await next()
  logEvent('request', {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - started,
    tenantId: c.get('tenantId'),
  })
}
