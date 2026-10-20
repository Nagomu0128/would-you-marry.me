import { ApiError, createErrorBody } from '@wym/shared'
import { Hono } from 'hono'
import { createAuth } from './auth'
import { log } from './lib/log'
import { requireAdmin, securityHeaders } from './middleware'
import { tenantRoutes } from './routes/tenants'
import type { AppBindings } from './types'

export const app = new Hono<AppBindings>()

app.use('*', securityHeaders)

// /api/auth/* は Better Auth に任せる（Google ログイン・コールバック・ログアウト）
app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw))

// それ以外の /api/* は管理者だけ
app.use('/api/*', requireAdmin)
// テナント以外の API（コンテンツ・URL・写真・参加者）は T11 で追加する
app.route('/api', tenantRoutes)

// API 以外のパスは静的アセット（SPA）を返す
app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith('/api/')) {
    return c.json(createErrorBody('NOT_FOUND', 'not found'), 404)
  }
  return c.env.ASSETS.fetch(c.req.raw)
})

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json(err.toBody(), err.status)
  }
  // 個人情報を含みうるので、例外の内容ではなく種類だけを記録する
  log('error', 'unhandled_error', { errorName: err.name })
  return c.json(createErrorBody('INTERNAL_ERROR', 'internal server error'), 500)
})
