// Better Auth（1.7.10）の Drizzle / SQLite 用の既定スキーマに合わせた表。
// 列の形は @better-auth/drizzle-adapter の generate-drizzle-schema（camelCase のプロパティ名、
// snake_case の列名、日時は timestamp_ms、真偽値は boolean）に従う。
// 表名は `auth_` 付き。Better Auth 側（T10）では modelName で対応づけ、
// drizzleAdapter の schema には { user: authUser, session: authSession, ... } を渡す。
import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`

export const authUser = sqliteTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(nowMs).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(nowMs)
    .$onUpdate(() => new Date())
    .notNull(),
})

export const authSession = sqliteTable(
  'auth_session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(nowMs).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
  },
  (t) => [index('auth_session_user_id_idx').on(t.userId)],
)

export const authAccount = sqliteTable(
  'auth_account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(nowMs).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('auth_account_user_id_idx').on(t.userId)],
)

export const authVerification = sqliteTable(
  'auth_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(nowMs).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(nowMs)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('auth_verification_identifier_idx').on(t.identifier)],
)

export type AuthUser = typeof authUser.$inferSelect
export type AuthSession = typeof authSession.$inferSelect
export type AuthAccount = typeof authAccount.$inferSelect
export type AuthVerification = typeof authVerification.$inferSelect
