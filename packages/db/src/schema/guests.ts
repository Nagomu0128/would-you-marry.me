import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { tenants } from './tenants'

/** 参加者。ニックネームは登録前 NULL（NULL どうしは一意制約にかからない） */
export const guests = sqliteTable(
  'guests',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    nickname: text('nickname'),
    /** 重複判定用（前後の空白を除いた値） */
    nicknameKey: text('nickname_key'),
    termsAgreedAt: integer('terms_agreed_at'),
    createdAt: integer('created_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
  },
  (t) => [uniqueIndex('guests_tenant_nickname_key_idx').on(t.tenantId, t.nicknameKey)],
)

export type Guest = typeof guests.$inferSelect
export type NewGuest = typeof guests.$inferInsert
