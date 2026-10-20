import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { coupleAccesses } from './couple-accesses'
import { guests } from './guests'
import { tenants } from './tenants'

/** 参加者・新郎新婦のセッション。ID そのものではなく SHA-256（16 進数）を保存する */
export const visitorSessions = sqliteTable(
  'visitor_sessions',
  {
    idHash: text('id_hash').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    kind: text('kind', { enum: ['guest', 'couple'] }).notNull(),
    guestId: text('guest_id').references(() => guests.id, { onDelete: 'cascade' }),
    coupleAccessId: text('couple_access_id').references(() => coupleAccesses.id, {
      onDelete: 'cascade',
    }),
    createdAt: integer('created_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
  },
  (t) => [
    check('visitor_sessions_kind_check', sql`${t.kind} IN ('guest', 'couple')`),
    index('visitor_sessions_couple_access_idx').on(t.coupleAccessId),
  ],
)

export type VisitorSession = typeof visitorSessions.$inferSelect
export type NewVisitorSession = typeof visitorSessions.$inferInsert
