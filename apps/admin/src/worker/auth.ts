// Better Auth（Google ログインのみ）と管理者の許可リスト
// docs/design/auth.md「管理者の認証」、docs/spec/api.md「admin Worker」
import { createDb, schema } from '@wym/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { eq } from 'drizzle-orm'
import { log } from './lib/log'
import type { AppEnv } from './types'

/** 許可リストで拒否したときのエラーコード（Better Auth がエラー URL の error に付ける） */
export const ADMIN_DENIED_CODE = 'ADMIN_NOT_ALLOWED'

/** メールアドレスの比較用の形（前後の空白を除き、小文字にする） */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** `ADMIN_EMAILS`（カンマ区切り）を正規化した配列にする */
export function parseAllowlist(value: string): string[] {
  return value
    .split(',')
    .map(normalizeEmail)
    .filter((email) => email !== '')
}

export function isAllowedEmail(allowlist: string, email: string): boolean {
  return parseAllowlist(allowlist).includes(normalizeEmail(email))
}

function deny(): never {
  throw new APIError('FORBIDDEN', { code: ADMIN_DENIED_CODE, message: 'admin not allowed' })
}

/** リクエストごとに env から作る */
export function createAuth(env: AppEnv) {
  const db = createDb(env.DB)
  return betterAuth({
    baseURL: env.ADMIN_ORIGIN,
    trustedOrigins: [env.ADMIN_ORIGIN],
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.authUser,
        session: schema.authSession,
        account: schema.authAccount,
        verification: schema.authVerification,
      },
    }),
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    databaseHooks: {
      user: {
        create: {
          // 新規ユーザーは、許可リストにあり、メールアドレスが確認済みのものだけ
          before: async (user) => {
            if (!user.emailVerified || !isAllowedEmail(env.ADMIN_EMAILS, user.email)) {
              log('warn', 'auth.denied', { stage: 'user.create' })
              deny()
            }
          },
        },
      },
      session: {
        create: {
          // 既存ユーザーのログインも、許可リストから外れていれば拒否する
          before: async (session) => {
            const [user] = await db
              .select()
              .from(schema.authUser)
              .where(eq(schema.authUser.id, session.userId))
            if (!user?.emailVerified || !isAllowedEmail(env.ADMIN_EMAILS, user.email)) {
              log('warn', 'auth.denied', { stage: 'session.create' })
              deny()
            }
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
