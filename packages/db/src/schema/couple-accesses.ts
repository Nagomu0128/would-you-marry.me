import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { tenants } from './tenants'

/** 新郎新婦用トークンとパスコード。有効なものはテナントに 1 つだけ */
export const coupleAccesses = sqliteTable(
  'couple_accesses',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    token: text('token').notNull().unique(),
    /** `pbkdf2-sha256$<反復回数>$<ソルト>$<ハッシュ>` */
    passcodeHash: text('passcode_hash').notNull(),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: integer('locked_until'),
    termsAgreedAt: integer('terms_agreed_at'),
    createdAt: integer('created_at').notNull(),
    revokedAt: integer('revoked_at'),
  },
  (t) => [
    uniqueIndex('couple_accesses_active_tenant_idx')
      .on(t.tenantId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
)

export type CoupleAccess = typeof coupleAccesses.$inferSelect
export type NewCoupleAccess = typeof coupleAccesses.$inferInsert
