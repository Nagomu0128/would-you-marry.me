import * as Sentry from '@sentry/cloudflare'
import { app } from './app'
import { scrubEvent } from './lib/sentry'
import { deleteExpiredTenants } from './jobs/delete-expired-tenants'
import type { AppEnv } from './types'

const handler = {
  fetch: app.fetch,
  // 毎日 3:00（UTC 18:00）。削除期限を過ぎたテナントを削除する
  async scheduled(_controller: ScheduledController, env: AppEnv, _ctx: ExecutionContext) {
    await deleteExpiredTenants(env)
  },
} satisfies ExportedHandler<AppEnv>

// SENTRY_DSN があるときだけ Sentry に送る（なければ何もしない）。
// Sentry 11 には sendDefaultPii の設定がなく、個人情報（IP・Cookie など）は既定で送られない
export default Sentry.withSentry(
  (env: AppEnv) => ({
    dsn: env.SENTRY_DSN || undefined,
    // 管理者のメールアドレス・Cookie・クエリ文字列・例外の message（SQL のパラメーターを含みうる）は送らない
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    beforeSend: scrubEvent,
  }),
  handler,
)
