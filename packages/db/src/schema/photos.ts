import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { guests } from './guests'
import { tenants } from './tenants'

/** 写真のメタデータ。画像本体は R2 */
export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    originalKey: text('original_key').notNull(),
    displayKey: text('display_key').notNull(),
    thumbKey: text('thumb_key').notNull(),
    /** image/jpeg / image/png */
    originalContentType: text('original_content_type').notNull(),
    /** 3 つの画像の合計サイズ */
    storedSizeBytes: integer('stored_size_bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** 投稿キー（D-41）。再送で二重に保存しないための、ブラウザが写真ごとに作る値。ない投稿は NULL */
    uploadKey: text('upload_key'),
    likeCount: integer('like_count').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('photos_timeline_idx').on(t.tenantId, sql`${t.createdAt} DESC`, sql`${t.id} DESC`),
    index('photos_ranking_idx').on(t.tenantId, sql`${t.likeCount} DESC`, sql`${t.createdAt} ASC`),
    index('photos_guest_idx').on(t.guestId, sql`${t.createdAt} DESC`),
    uniqueIndex('photos_upload_key_idx').on(t.guestId, t.uploadKey),
  ],
)

export type Photo = typeof photos.$inferSelect
export type NewPhoto = typeof photos.$inferInsert
