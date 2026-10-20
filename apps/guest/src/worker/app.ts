import * as Sentry from '@sentry/cloudflare'
import { ApiError, createErrorBody } from '@wym/shared'
import { Hono } from 'hono'
import { logEvent } from './lib/logger'
import { csrf } from './middleware/csrf'
import { dbMiddleware } from './middleware/db'
import { requestLog, securityHeaders } from './middleware/headers'
import { configRoutes } from './routes/config'
import { couplePageRoutes } from './routes/couple'
import { guestRoutes } from './routes/guest'
import { joinRoutes } from './routes/join'
import type { AppEnv } from './types'

export const app = new Hono<AppEnv>()

// すべてのレスポンスにセキュリティ関係のヘッダーを付け、リクエストを 1 行ログに出す
app.use('*', securityHeaders)
app.use('*', requestLog)
app.use('*', dbMiddleware)
// 状態を変えるリクエストは Origin を確認する（CSRF）
app.use('/api/*', csrf)

// ページ遷移（サーバー側の処理）
app.route('/join', joinRoutes)
app.route('/couple', couplePageRoutes)

// API
app.route('/api/config', configRoutes)
app.route('/api/t/:tenantId', guestRoutes)
// /api/couple/:tenantId/* は T09 で足す

// API 以外のパスは静的アセット（SPA）を返す。
// /couple/:tenantId/login などの SPA のパスも、ここから index.html を返す
app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith('/api/')) {
    return c.json(createErrorBody('NOT_FOUND', 'not found'), 404)
  }
  return c.env.ASSETS.fetch(c.req.raw)
})

app.onError((err, c) => {
  if (err instanceof ApiError) {
    logEvent('api_error', { code: err.code, status: err.status, tenantId: c.get('tenantId') })
    return c.json(err.toBody(), err.status)
  }
  // 個人情報を含みうるので、例外の内容ではなく種類だけをログに出す（Sentry には送る）
  Sentry.captureException(err)
  logEvent('unhandled_error', { errorName: err.name, tenantId: c.get('tenantId') }, 'error')
  return c.json(createErrorBody('INTERNAL_ERROR', 'internal server error'), 500)
})
