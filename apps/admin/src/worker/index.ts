import { ApiError, createErrorBody } from '@wym/shared'
import { Hono } from 'hono'

const app = new Hono<{ Bindings: Cloudflare.Env }>()

// Better Auth・各ルートは T10 以降で追加する

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
  console.error(JSON.stringify({ level: 'error', message: 'unhandled error', name: err.name }))
  return c.json(createErrorBody('INTERNAL_ERROR', 'internal server error'), 500)
})

export default {
  fetch: app.fetch,
  // 定期処理（開催日の 6 か月後のデータ削除）は T10 で実装する
  async scheduled(
    _controller: ScheduledController,
    _env: Cloudflare.Env,
    _ctx: ExecutionContext,
  ) {},
} satisfies ExportedHandler<Cloudflare.Env>
