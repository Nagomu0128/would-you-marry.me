// シークレット（wrangler secret put / .dev.vars）の型。vars は wrangler types が生成する
declare namespace Cloudflare {
  interface Env {
    SENTRY_DSN?: string
  }
}
