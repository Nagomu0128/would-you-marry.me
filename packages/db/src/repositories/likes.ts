import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../index'
import { likes, photos } from '../schema'

export type LikeState = { likeCount: number; likedByMe: boolean }

function recountLikes(db: Db, tenantId: string, photoId: string) {
  return db
    .update(photos)
    .set({
      likeCount: sql`(SELECT COUNT(*) FROM likes WHERE likes.photo_id = ${photoId})`,
    })
    .where(and(eq(photos.id, photoId), eq(photos.tenantId, tenantId)))
}

function readLikeState(db: Db, tenantId: string, guestId: string, photoId: string) {
  return db
    .select({
      likeCount: photos.likeCount,
      likedByMe: sql<number>`EXISTS (SELECT 1 FROM likes WHERE likes.photo_id = ${photoId} AND likes.guest_id = ${guestId})`,
    })
    .from(photos)
    .where(
      and(
        eq(photos.id, photoId),
        eq(photos.tenantId, tenantId),
        // 参加者も同じテナントに属していること
        sql`EXISTS (SELECT 1 FROM guests WHERE guests.id = ${guestId} AND guests.tenant_id = ${tenantId})`,
      ),
    )
}

function toLikeState(rows: { likeCount: number; likedByMe: number }[]): LikeState | undefined {
  const row = rows[0]
  return row ? { likeCount: row.likeCount, likedByMe: Boolean(row.likedByMe) } : undefined
}

/**
 * いいねを付ける。何度実行しても結果は同じ（すでにいいね済みなら何もしない）。
 * バッチで `INSERT ... ON CONFLICT DO NOTHING` と、いいね数の数え直しを行う。
 * 写真と参加者が `tenantId` のテナントに属していなければ何もせず undefined を返す。
 * 自分の写真にも付けられる。
 */
export async function likePhoto(
  db: Db,
  tenantId: string,
  guestId: string,
  photoId: string,
  now: number = Date.now(),
): Promise<LikeState | undefined> {
  const [, , state] = await db.batch([
    // 列の順は likes 表の定義（photo_id, guest_id, tenant_id, created_at）
    db
      .insert(likes)
      .select(
        sql`SELECT p.id, g.id, ${tenantId}, ${now}
          FROM photos p, guests g
          WHERE p.id = ${photoId} AND p.tenant_id = ${tenantId}
            AND g.id = ${guestId} AND g.tenant_id = ${tenantId}`,
      )
      .onConflictDoNothing(),
    recountLikes(db, tenantId, photoId),
    readLikeState(db, tenantId, guestId, photoId),
  ])
  return toLikeState(state)
}

/**
 * いいねを取り消す。何度実行しても結果は同じ（いいねしていなければ何もしない）。
 * 写真が `tenantId` のテナントに属していなければ何もせず undefined を返す。
 */
export async function unlikePhoto(
  db: Db,
  tenantId: string,
  guestId: string,
  photoId: string,
): Promise<LikeState | undefined> {
  const [, , state] = await db.batch([
    db
      .delete(likes)
      .where(
        and(eq(likes.photoId, photoId), eq(likes.guestId, guestId), eq(likes.tenantId, tenantId)),
      ),
    recountLikes(db, tenantId, photoId),
    readLikeState(db, tenantId, guestId, photoId),
  ])
  return toLikeState(state)
}
