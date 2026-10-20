import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../index'
import { type CourseMenuImage, courseMenuImages } from '../schema'

/** コース表の画像の一覧（表示順） */
export async function listCourseMenuImages(db: Db, tenantId: string): Promise<CourseMenuImage[]> {
  return db
    .select()
    .from(courseMenuImages)
    .where(eq(courseMenuImages.tenantId, tenantId))
    .orderBy(asc(courseMenuImages.sortOrder), asc(courseMenuImages.id))
}

export async function getCourseMenuImage(
  db: Db,
  tenantId: string,
  imageId: string,
): Promise<CourseMenuImage | undefined> {
  const [row] = await db
    .select()
    .from(courseMenuImages)
    .where(and(eq(courseMenuImages.id, imageId), eq(courseMenuImages.tenantId, tenantId)))
  return row
}

export type NewCourseMenuImageInput = {
  /** 呼び出し側で採番する（R2 のキーに使うため） */
  id: string
  r2Key: string
  contentType: 'image/jpeg' | 'image/png'
  sizeBytes: number
}

/** コース表の画像を末尾に追加する */
export async function addCourseMenuImage(
  db: Db,
  tenantId: string,
  input: NewCourseMenuImageInput,
  now: number = Date.now(),
): Promise<CourseMenuImage> {
  const [row] = await db
    .insert(courseMenuImages)
    .values({
      id: input.id,
      tenantId,
      r2Key: input.r2Key,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      sortOrder: sql`(SELECT COALESCE(MAX(sort_order) + 1, 0) FROM course_menu_images WHERE tenant_id = ${tenantId})`,
      uploadedAt: now,
    })
    .returning()
  if (!row) throw new Error('failed to add course menu image')
  return row
}

/**
 * コース表の画像を削除し、残りの表示順を 0 から詰める。
 * @returns 削除した行（R2 のキーを消すために使う）。なければ undefined
 */
export async function deleteCourseMenuImage(
  db: Db,
  tenantId: string,
  imageId: string,
): Promise<CourseMenuImage | undefined> {
  const [deleted] = await db.batch([
    db
      .delete(courseMenuImages)
      .where(and(eq(courseMenuImages.id, imageId), eq(courseMenuImages.tenantId, tenantId)))
      .returning(),
    db
      .update(courseMenuImages)
      .set({
        sortOrder: sql`(SELECT COUNT(*) FROM course_menu_images o WHERE o.tenant_id = ${tenantId} AND o.sort_order < course_menu_images.sort_order)`,
      })
      .where(eq(courseMenuImages.tenantId, tenantId)),
  ])
  return deleted[0]
}

/**
 * コース表の画像を並べ替える。`imageIds` は、そのテナントのすべての画像 ID を
 * 表示したい順に並べたもの（過不足・重複・他のテナントの ID があれば並べ替えない）。
 * @returns 並べ替えたか
 */
export async function reorderCourseMenuImages(
  db: Db,
  tenantId: string,
  imageIds: readonly string[],
): Promise<boolean> {
  const current = await db
    .select({ id: courseMenuImages.id })
    .from(courseMenuImages)
    .where(eq(courseMenuImages.tenantId, tenantId))
  const currentIds = new Set(current.map((row) => row.id))
  const requested = new Set(imageIds)
  const sameSet =
    requested.size === imageIds.length &&
    requested.size === currentIds.size &&
    imageIds.every((id) => currentIds.has(id))
  const [first, ...rest] = imageIds
  if (!sameSet || first === undefined) return sameSet

  const update = (id: string, index: number) =>
    db
      .update(courseMenuImages)
      .set({ sortOrder: index })
      .where(and(eq(courseMenuImages.id, id), eq(courseMenuImages.tenantId, tenantId)))
  await db.batch([update(first, 0), ...rest.map((id, i) => update(id, i + 1))])
  return true
}
