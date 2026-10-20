import type { Db, Guest, Tenant } from '@wym/db'

/**
 * Hono の型。すべてのルートで共通。
 * `db` は middleware/db.ts が最初に入れる。
 */
export type AppEnv = {
  Bindings: Cloudflare.Env
  Variables: {
    db: Db
    /** 検証済みのテナント ID（ログ用。参加者向け API・新郎新婦向け API の共通処理が入れる） */
    tenantId?: string
  }
}

/**
 * 参加者向け API（`/api/t/:tenantId/*`）の共通処理（middleware/session.ts の `guestSession`）を
 * 通ったあとのルートで使う型。ここにある値は検証済みで、`tenant.id === guest.tenantId` が保証されている。
 * ルートハンドラーは URL のテナント ID ではなく、必ず `c.var.tenant.id` を使うこと。
 */
export type GuestEnv = {
  Bindings: Cloudflare.Env
  Variables: Omit<AppEnv['Variables'], 'tenantId'> & {
    tenant: Tenant
    guest: Guest
    tenantId: string
  }
}
