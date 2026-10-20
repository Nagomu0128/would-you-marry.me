import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { tenants } from './tenants'

/** 席次表 PDF（テナントに 1 つ） */
export const seatingCharts = sqliteTable('seating_charts', {
  tenantId: text('tenant_id')
    .primaryKey()
    .references(() => tenants.id),
  r2Key: text('r2_key').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedAt: integer('uploaded_at').notNull(),
})

export type SeatingChart = typeof seatingCharts.$inferSelect
export type NewSeatingChart = typeof seatingCharts.$inferInsert
