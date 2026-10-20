import { eq, sql } from 'drizzle-orm'
import type { Db } from '../index'
import { type SeatingChart, seatingCharts } from '../schema'

export async function getSeatingChart(db: Db, tenantId: string): Promise<SeatingChart | undefined> {
  const [row] = await db.select().from(seatingCharts).where(eq(seatingCharts.tenantId, tenantId))
  return row
}

export type UpsertSeatingChartResult = {
  chart: SeatingChart
  /** 差し替え前の R2 キー。呼び出し側が R2 から削除する。初めての登録なら null */
  replacedR2Key: string | null
}

/**
 * 席次表を登録・差し替える。差し替えのたびに新しい R2 キーを使うこと
 * （`seatingChartKey`）。古いファイルの削除は呼び出し側が行う。
 */
export async function upsertSeatingChart(
  db: Db,
  tenantId: string,
  input: { r2Key: string; sizeBytes: number },
  now: number = Date.now(),
): Promise<UpsertSeatingChartResult> {
  const chart: SeatingChart = {
    tenantId,
    r2Key: input.r2Key,
    sizeBytes: input.sizeBytes,
    uploadedAt: now,
  }
  const [previous] = await db.batch([
    db
      .select({ r2Key: seatingCharts.r2Key })
      .from(seatingCharts)
      .where(eq(seatingCharts.tenantId, tenantId)),
    db
      .insert(seatingCharts)
      .values(chart)
      .onConflictDoUpdate({
        target: seatingCharts.tenantId,
        set: {
          r2Key: sql`excluded.r2_key`,
          sizeBytes: sql`excluded.size_bytes`,
          uploadedAt: sql`excluded.uploaded_at`,
        },
      }),
  ])
  const previousKey = previous[0]?.r2Key ?? null
  return { chart, replacedR2Key: previousKey === input.r2Key ? null : previousKey }
}
