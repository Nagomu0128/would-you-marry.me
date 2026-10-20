import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** テナント（1 つの結婚式） */
export const tenants = sqliteTable(
  'tenants',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** 開催日（YYYY-MM-DD、日本時間） */
    eventDate: text('event_date').notNull(),
    suspended: integer('suspended', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    dataDeletedAt: integer('data_deleted_at'),
  },
  (t) => [index('tenants_event_date_idx').on(t.eventDate)],
)

export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
