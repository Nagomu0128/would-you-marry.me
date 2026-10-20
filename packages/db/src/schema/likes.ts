import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { guests } from './guests'
import { photos } from './photos'
import { tenants } from './tenants'

/** いいね。(photo_id, guest_id) で一意 */
export const likes = sqliteTable(
  'likes',
  {
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.photoId, t.guestId] }),
    index('likes_guest_photo_idx').on(t.guestId, t.photoId),
  ],
)

export type Like = typeof likes.$inferSelect
export type NewLike = typeof likes.$inferInsert
