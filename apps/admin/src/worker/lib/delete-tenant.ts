import { createDb, deleteTenantData, deleteTenantObjects, recordAuditLog } from '@wym/db'

/**
 * テナントのデータを削除する（docs/spec/database.md「テナントの削除」）。
 * 1. R2 の `tenants/{tenantId}/` 以下 → 2. D1 の各表と `data_deleted_at` → 3. 監査ログ `tenant.delete`
 * 途中で失敗すると例外を投げる。`data_deleted_at` が空のまま残るので、やり直せる。
 * @param actor 管理者のメールアドレス。定期処理は `system`
 */
export async function deleteTenant(
  env: { DB: D1Database; BUCKET: R2Bucket },
  tenantId: string,
  actor: string,
): Promise<void> {
  const db = createDb(env.DB)
  const deletedObjects = await deleteTenantObjects(env.BUCKET, tenantId)
  await deleteTenantData(db, tenantId)
  await recordAuditLog(db, {
    tenantId,
    actor,
    action: 'tenant.delete',
    detail: { deletedObjects },
  })
}
