// シークレット（wrangler secret put / .dev.vars）の型。vars は wrangler types が生成する
declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET: string
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
    SENTRY_DSN?: string
  }
}
