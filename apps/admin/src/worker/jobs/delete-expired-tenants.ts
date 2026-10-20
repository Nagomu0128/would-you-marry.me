// 定期処理: 削除期限（開催日の 6 か月後）を過ぎたテナントのデータを削除する
import { createDb, listDeletionCandidates } from '@wym/db'
import { getTenantPhase, toJstDateString } from '@wym/shared'
import { deleteTenant } from '../lib/delete-tenant'
import { log } from '../lib/log'

export type DeleteExpiredResult = { deleted: number; failed: number }

/** 定期処理が監査ログに残す actor */
export const SYSTEM_ACTOR = 'system'

export async function deleteExpiredTenants(
  env: { DB: D1Database; BUCKET: R2Bucket },
  now: Date = new Date(),
): Promise<DeleteExpiredResult> {
  const db = createDb(env.DB)
  // D1 で候補を絞り（開催日が今日以前）、期間の確定は shared の関数で行う
  const candidates = await listDeletionCandidates(db, toJstDateString(now))
  const result: DeleteExpiredResult = { deleted: 0, failed: 0 }

  for (const tenant of candidates) {
    if (getTenantPhase(tenant.eventDate, now) !== 'expired') continue
    try {
      await deleteTenant(env, tenant.id, SYSTEM_ACTOR)
      result.deleted++
      log('info', 'tenant.auto_deleted', { tenantId: tenant.id })
    } catch (err) {
      // 1 件の失敗で全体を止めない。data_deleted_at が空のまま残るので次回やり直す
      result.failed++
      log('error', 'tenant.auto_delete_failed', {
        tenantId: tenant.id,
        errorName: err instanceof Error ? err.name : 'unknown',
      })
    }
  }

  log('info', 'job.delete_expired_tenants', { ...result, candidates: candidates.length })
  return result
}
