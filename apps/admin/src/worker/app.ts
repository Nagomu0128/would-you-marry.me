import * as Sentry from '@sentry/cloudflare'
import { ApiError, createErrorBody } from '@wym/shared'
import { Hono } from 'hono'
import { createAuth } from './auth'
import { log } from './lib/log'
import { requireAdmin, securityHeaders } from './middleware'
import { accessRoutes } from './routes/access'
import { contentRoutes } from './routes/content'
import { guestRoutes } from './routes/guests'
import { photoRoutes } from './routes/photos'
import { tenantRoutes } from './routes/tenants'
import type { AppBindings } from './types'

export const app = new Hono<AppBindings>()

app.use('*', securityHeaders)

// /api/auth/* は Better Auth に任せる（Google ログイン・コールバック・ログアウト）
app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw))

// それ以外の /api/* は管理者だけ
app.use('/api/*', requireAdmin)
app.route('/api', tenantRoutes)
app.route('/api', contentRoutes)
app.route('/api', accessRoutes)
app.route('/api', photoRoutes)
app.route('/api', guestRoutes)

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
  // 個人情報を含みうるので、例外の内容ではなく種類だけをログに出す（Sentry には送る）
  Sentry.captureException(err)
  log('error', 'unhandled_error', { errorName: err.name })
  return c.json(createErrorBody('INTERNAL_ERROR', 'internal server error'), 500)
})
