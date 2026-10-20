// guest Worker の入口: /join・/couple・/api の振り分けは app.ts
import * as Sentry from '@sentry/cloudflare'
import { app } from './app'
import { scrubEvent } from './lib/sentry'

// SENTRY_DSN が設定されているときだけ有効になる（空なら何も送らない）。
// Cookie・クエリ文字列（参加トークンを含みうる）・ヘッダー・本文・ユーザー情報（IP アドレスなど）は送らない。
// （@sentry/cloudflare v11 では `sendDefaultPii` が `dataCollection` に置き換わっている）
export default Sentry.withSentry(
  (env: Cloudflare.Env) => ({
    dsn: env.SENTRY_DSN || undefined,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    beforeSend: scrubEvent,
  }),
  app,
)
