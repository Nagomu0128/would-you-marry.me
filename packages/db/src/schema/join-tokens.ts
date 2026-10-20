import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { tenants } from './tenants'

/** 参加トークン。有効なもの（revoked_at が NULL）はテナントに 1 つだけ */
export const joinTokens = sqliteTable(
  'join_tokens',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at').notNull(),
    revokedAt: integer('revoked_at'),
  },
  (t) => [
    uniqueIndex('join_tokens_active_tenant_idx').on(t.tenantId).where(sql`${t.revokedAt} IS NULL`),
  ],
)

export type JoinToken = typeof joinTokens.$inferSelect
export type NewJoinToken = typeof joinTokens.$inferInsert
