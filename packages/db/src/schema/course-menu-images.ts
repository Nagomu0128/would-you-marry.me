import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { tenants } from './tenants'

/** 料理のコース表の画像 */
export const courseMenuImages = sqliteTable(
  'course_menu_images',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    r2Key: text('r2_key').notNull(),
    /** image/jpeg / image/png */
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** 表示順（0 から） */
    sortOrder: integer('sort_order').notNull(),
    uploadedAt: integer('uploaded_at').notNull(),
  },
  (t) => [index('course_menu_images_tenant_sort_idx').on(t.tenantId, t.sortOrder)],
)

export type CourseMenuImage = typeof courseMenuImages.$inferSelect
export type NewCourseMenuImage = typeof courseMenuImages.$inferInsert
