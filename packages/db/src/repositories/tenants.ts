import { and, eq, isNull, lte, sql } from 'drizzle-orm'
import type { Db } from '../index'
import { newId } from '../lib'
import {
  coupleAccesses,
  courseMenuImages,
  guests,
  joinTokens,
  likes,
  photos,
  seatingCharts,
  type Tenant,
  tenants,
  visitorSessions,
} from '../schema'

export type TenantStats = {
  /** ニックネーム登録済みの参加者の数 */
  guestCount: number
  photoCount: number
  likeCount: number
  /** 写真・席次表・コース表の size の合計（バイト） */
  storageBytes: number
}

export type TenantWithStats = Tenant & { stats: TenantStats }

export type CreateTenantInput = {
  name: string
  /** YYYY-MM-DD（日本時間） */
  eventDate: string
  /** 作成した管理者のメールアドレス */
  createdBy: string
}

/** テナントを作る */
export async function createTenant(
  db: Db,
  input: CreateTenantInput,
  now: number = Date.now(),
): Promise<Tenant> {
  const [row] = await db
    .insert(tenants)
    .values({
      id: newId(),
      name: input.name,
      eventDate: input.eventDate,
      suspended: false,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  if (!row) throw new Error('failed to create tenant')
  return row
}

/** テナントを取る。データ削除済みのものも返す（判定は呼び出し側） */
export async function getTenant(db: Db, tenantId: string): Promise<Tenant | undefined> {
  const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
  return row
}

type StatsRow = {
  id: string
  guest_count: number
  photo_count: number
  like_count: number
  storage_bytes: number
}

// 相関サブクエリは、Drizzle が単一表の select で列の表名を省くため、生の SQL で書く
const STATS_SQL = sql`
  SELECT
    t.id AS id,
    (SELECT COUNT(*) FROM guests g WHERE g.tenant_id = t.id AND g.nickname IS NOT NULL) AS guest_count,
    (SELECT COUNT(*) FROM photos p WHERE p.tenant_id = t.id) AS photo_count,
    (SELECT COUNT(*) FROM likes l WHERE l.tenant_id = t.id) AS like_count,
    (SELECT COALESCE(SUM(p.stored_size_bytes), 0) FROM photos p WHERE p.tenant_id = t.id)
      + (SELECT COALESCE(SUM(s.size_bytes), 0) FROM seating_charts s WHERE s.tenant_id = t.id)
      + (SELECT COALESCE(SUM(c.size_bytes), 0) FROM course_menu_images c WHERE c.tenant_id = t.id)
      AS storage_bytes
  FROM tenants t
`

function toStats(row: StatsRow): TenantStats {
  return {
    guestCount: row.guest_count,
    photoCount: row.photo_count,
    likeCount: row.like_count,
    storageBytes: row.storage_bytes,
  }
}

/** テナントの利用状況 */
export async function getTenantStats(db: Db, tenantId: string): Promise<TenantStats | undefined> {
  const rows = await db.all<StatsRow>(sql`${STATS_SQL} WHERE t.id = ${tenantId}`)
  return rows[0] ? toStats(rows[0]) : undefined
}

/** テナントの一覧（利用状況つき）。開催日の新しい順 */
export async function listTenantsWithStats(db: Db): Promise<TenantWithStats[]> {
  const [tenantRows, statsRows] = await Promise.all([
    db.select().from(tenants),
    db.all<StatsRow>(STATS_SQL),
  ])
  const statsById = new Map(statsRows.map((row) => [row.id, toStats(row)]))
  const empty: TenantStats = { guestCount: 0, photoCount: 0, likeCount: 0, storageBytes: 0 }
  return tenantRows
    .map((tenant) => ({ ...tenant, stats: statsById.get(tenant.id) ?? empty }))
    .sort((a, b) =>
      a.eventDate === b.eventDate ? b.createdAt - a.createdAt : a.eventDate < b.eventDate ? 1 : -1,
    )
}

export type UpdateTenantInput = {
  name?: string
  eventDate?: string
  suspended?: boolean
}

/**
 * テナントの基本情報・停止状態を変更する。
 * データ削除済みのテナントは変更せず undefined を返す。
 */
export async function updateTenant(
  db: Db,
  tenantId: string,
  input: UpdateTenantInput,
  now: number = Date.now(),
): Promise<Tenant | undefined> {
  const [row] = await db
    .update(tenants)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.eventDate !== undefined && { eventDate: input.eventDate }),
      ...(input.suspended !== undefined && { suspended: input.suspended }),
      updatedAt: now,
    })
    .where(and(eq(tenants.id, tenantId), isNull(tenants.dataDeletedAt)))
    .returning()
  return row
}

/**
 * データ削除の候補を取る（`data_deleted_at` が空で、開催日が指定の日付以前のもの）。
 * 期間の厳密な判定（expired か）は、呼び出し側が shared の関数で行う。
 * 開催日の古い順。
 */
export async function listDeletionCandidates(
  db: Db,
  eventDateOnOrBefore: string,
): Promise<Tenant[]> {
  return db
    .select()
    .from(tenants)
    .where(and(isNull(tenants.dataDeletedAt), lte(tenants.eventDate, eventDateOnOrBefore)))
    .orderBy(tenants.eventDate)
}

/**
 * テナントの D1 のデータを削除する（docs/spec/database.md「テナントの削除」の手順 2）。
 * 1 つのバッチで、各表のそのテナントの行を削除し、`data_deleted_at` を記録する。
 * `tenants` の行は残す。R2 の削除（手順 1）は `deleteTenantObjects`、監査ログ（手順 3）は
 * `recordAuditLog` を呼び出し側で行う。
 */
export async function deleteTenantData(
  db: Db,
  tenantId: string,
  now: number = Date.now(),
): Promise<void> {
  await db.batch([
    db.delete(likes).where(eq(likes.tenantId, tenantId)),
    db.delete(photos).where(eq(photos.tenantId, tenantId)),
    db.delete(visitorSessions).where(eq(visitorSessions.tenantId, tenantId)),
    db.delete(guests).where(eq(guests.tenantId, tenantId)),
    db.delete(joinTokens).where(eq(joinTokens.tenantId, tenantId)),
    db.delete(coupleAccesses).where(eq(coupleAccesses.tenantId, tenantId)),
    db.delete(seatingCharts).where(eq(seatingCharts.tenantId, tenantId)),
    db.delete(courseMenuImages).where(eq(courseMenuImages.tenantId, tenantId)),
    db.update(tenants).set({ dataDeletedAt: now, updatedAt: now }).where(eq(tenants.id, tenantId)),
  ])
}
