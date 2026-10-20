/**
 * Worker が使う環境。wrangler types は vars をリテラル型にするので、
 * 値を文字列として扱う項目は広げておく（テストで値を差し替えられる）
 */
export type AppEnv = Omit<Cloudflare.Env, 'ADMIN_EMAILS' | 'ADMIN_ORIGIN' | 'GUEST_ORIGIN'> & {
  ADMIN_EMAILS: string
  ADMIN_ORIGIN: string
  GUEST_ORIGIN: string
}

export type AppBindings = {
  Bindings: AppEnv
  Variables: {
    /** 認証済みの管理者のメールアドレス（小文字） */
    adminEmail: string
    adminName: string | null
  }
}
