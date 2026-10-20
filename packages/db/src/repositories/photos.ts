import { and, asc, count, desc, eq, gt, inArray, lt, or, type SQL, sql } from 'drizzle-orm'
import type { Db } from '../index'
import { guests, likes, type Photo, photos } from '../schema'

export type PhotoWithUploader = {
  photo: Photo
  uploader: { id: string; nickname: string | null }
}

export type NewPhotoInput = {
  /** 呼び出し側で採番する（R2 のキーに使うため、アップロードの前に必要） */
  id: string
  guestId: string
  originalKey: string
  displayKey: string
  thumbKey: string
  originalContentType: 'image/jpeg' | 'image/png'
  /** 3 つの画像の合計サイズ */
  storedSizeBytes: number
  width: number
  height: number
}

export type InsertPhotoResult = { inserted: true; photo: Photo } | { inserted: false }

/**
 * 投稿枚数の上限を確かめながら写真を登録する。
 * 1 つの `INSERT ... SELECT ... WHERE (SELECT COUNT(*) ...) < ?` で行うので、
 * 同時に投稿しても上限を超えない。
 * 参加者がこのテナントにいない場合も登録されない。
 * @param limit 1 人あたりの上限（100 枚。packages/shared の定数を渡す）
 * @returns 登録できなかった（上限に達している）ときは `{ inserted: false }`
 */
export async function insertPhotoWithLimit(
  db: Db,
  tenantId: string,
  input: NewPhotoInput,
  limit: number,
  now: number = Date.now(),
): Promise<InsertPhotoResult> {
  const result = await db.run(sql`
    INSERT INTO photos (
      id, tenant_id, guest_id, original_key, display_key, thumb_key, original_content_type,
      stored_size_bytes, width, height, like_count, created_at
    )
    SELECT
      ${input.id}, ${tenantId}, ${input.guestId}, ${input.originalKey}, ${input.displayKey},
      ${input.thumbKey}, ${input.originalContentType}, ${input.storedSizeBytes}, ${input.width},
      ${input.height}, 0, ${now}
    WHERE EXISTS (SELECT 1 FROM guests WHERE id = ${input.guestId} AND tenant_id = ${tenantId})
      AND (SELECT COUNT(*) FROM photos WHERE guest_id = ${input.guestId} AND tenant_id = ${tenantId}) < ${limit}
  `)
  if (result.meta.changes === 0) return { inserted: false }
  const photo = await getPhoto(db, tenantId, input.id)
  if (!photo) throw new Error('failed to read the inserted photo')
  return { inserted: true, photo }
}

export async function getPhoto(
  db: Db,
  tenantId: string,
  photoId: string,
): Promise<Photo | undefined> {
  const [row] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, photoId), eq(photos.tenantId, tenantId)))
  return row
}

/** 参加者の投稿枚数 */
export async function countGuestPhotos(db: Db, tenantId: string, guestId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(photos)
    .where(and(eq(photos.guestId, guestId), eq(photos.tenantId, tenantId)))
  return row?.value ?? 0
}

/** カーソルが不正なとき */
export class InvalidCursorError extends Error {
  constructor() {
    super('invalid cursor')
    this.name = 'InvalidCursorError'
  }
}

/** タイムラインのカーソル（最後の写真の `createdAt_id`）を作る */
export function encodeTimelineCursor(photo: Pick<Photo, 'createdAt' | 'id'>): string {
  return `${photo.createdAt}_${photo.id}`
}

function decodeTimelineCursor(cursor: string): { createdAt: number; id: string } {
  const separator = cursor.indexOf('_')
  const createdAtText = cursor.slice(0, separator)
  const id = cursor.slice(separator + 1)
  if (separator <= 0 || id === '' || !/^\d+$/.test(createdAtText)) throw new InvalidCursorError()
  const createdAt = Number(createdAtText)
  if (!Number.isSafeInteger(createdAt)) throw new InvalidCursorError()
  return { createdAt, id }
}

export type TimelineOptions = {
  /** 前回の `nextCursor` */
  cursor?: string | null
  limit: number
  /** 投稿者で絞り込む（自分の投稿、新郎新婦の投稿者絞り込み） */
  guestId?: string
}

export type TimelinePage = {
  photos: PhotoWithUploader[]
  /** 続きがなければ null */
  nextCursor: string | null
}

const uploaderSelection = {
  photo: photos,
  uploaderId: guests.id,
  uploaderNickname: guests.nickname,
}

function toPhotoWithUploader(row: {
  photo: Photo
  uploaderId: string
  uploaderNickname: string | null
}): PhotoWithUploader {
  return { photo: row.photo, uploader: { id: row.uploaderId, nickname: row.uploaderNickname } }
}

/**
 * タイムライン（新しい順）。カーソルは最後の写真の `createdAt` と `id`。
 * `created_at` が同じ写真があっても、`id` で順序が決まるので重複・欠落しない。
 * @throws InvalidCursorError カーソルが不正なとき
 */
export async function listTimeline(
  db: Db,
  tenantId: string,
  options: TimelineOptions,
): Promise<TimelinePage> {
  const conditions: SQL[] = [eq(photos.tenantId, tenantId)]
  if (options.guestId !== undefined) conditions.push(eq(photos.guestId, options.guestId))
  if (options.cursor) {
    const cursor = decodeTimelineCursor(options.cursor)
    const older = or(
      lt(photos.createdAt, cursor.createdAt),
      and(eq(photos.createdAt, cursor.createdAt), lt(photos.id, cursor.id)),
    )
    if (older) conditions.push(older)
  }
  const rows = await db
    .select(uploaderSelection)
    .from(photos)
    .innerJoin(guests, and(eq(guests.id, photos.guestId), eq(guests.tenantId, photos.tenantId)))
    .where(and(...conditions))
    .orderBy(desc(photos.createdAt), desc(photos.id))
    .limit(options.limit + 1)
  const page = rows.slice(0, options.limit).map(toPhotoWithUploader)
  const last = page[page.length - 1]
  const hasMore = rows.length > options.limit
  return { photos: page, nextCursor: hasMore && last ? encodeTimelineCursor(last.photo) : null }
}

/** ランキングの既定の件数 */
export const RANKING_SIZE = 10

/** ランキング。いいねが 1 件以上の写真を、いいね数の多い順・同数は古い順に並べる */
export async function listRanking(
  db: Db,
  tenantId: string,
  limit: number = RANKING_SIZE,
): Promise<PhotoWithUploader[]> {
  const rows = await db
    .select(uploaderSelection)
    .from(photos)
    .innerJoin(guests, and(eq(guests.id, photos.guestId), eq(guests.tenantId, photos.tenantId)))
    .where(and(eq(photos.tenantId, tenantId), gt(photos.likeCount, 0)))
    .orderBy(desc(photos.likeCount), asc(photos.createdAt), asc(photos.id))
    .limit(limit)
  return rows.map(toPhotoWithUploader)
}

/** 指定した写真のうち、この参加者がいいね済みのものの ID */
export async function getLikedPhotoIds(
  db: Db,
  tenantId: string,
  guestId: string,
  photoIds: readonly string[],
): Promise<Set<string>> {
  const liked = new Set<string>()
  // D1 のバインド変数の上限に収まるよう分割する
  for (let i = 0; i < photoIds.length; i += 50) {
    const chunk = photoIds.slice(i, i + 50)
    const rows = await db
      .select({ photoId: likes.photoId })
      .from(likes)
      .where(
        and(
          eq(likes.tenantId, tenantId),
          eq(likes.guestId, guestId),
          inArray(likes.photoId, chunk),
        ),
      )
    for (const row of rows) liked.add(row.photoId)
  }
  return liked
}

/**
 * 参加者本人の写真を削除する。他人の写真・他のテナントの写真は削除せず undefined を返す。
 * @returns 削除した行（R2 のキーを消すために使う）
 */
export async function deleteOwnPhoto(
  db: Db,
  tenantId: string,
  guestId: string,
  photoId: string,
): Promise<Photo | undefined> {
  const [row] = await db
    .delete(photos)
    .where(and(eq(photos.id, photoId), eq(photos.tenantId, tenantId), eq(photos.guestId, guestId)))
    .returning()
  return row
}

/**
 * 管理者として写真を削除する（投稿者を問わない。テナントは一致している必要がある）。
 * いいねは外部キーでまとめて消える。
 * @returns 削除した行（R2 のキーを消すために使う）
 */
export async function deletePhotoAsAdmin(
  db: Db,
  tenantId: string,
  photoId: string,
): Promise<Photo | undefined> {
  const [row] = await db
    .delete(photos)
    .where(and(eq(photos.id, photoId), eq(photos.tenantId, tenantId)))
    .returning()
  return row
}
