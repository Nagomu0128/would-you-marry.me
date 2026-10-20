import type { Db } from '../index'
import { newId } from '../lib'
import type { AuditAction, AuditLog } from '../schema'
import { auditLogs } from '../schema'

export type RecordAuditLogInput = {
  tenantId?: string | null
  /** 管理者のメールアドレス。定期処理は `system` */
  actor: string
  action: AuditAction
  /** 写真 ID、参加者 ID など */
  targetId?: string | null
  /** 変更前後の値など。JSON にして保存する（個人情報を入れない） */
  detail?: unknown
}

/** 管理操作を記録する */
export async function recordAuditLog(
  db: Db,
  input: RecordAuditLogInput,
  now: number = Date.now(),
): Promise<AuditLog> {
  const row: AuditLog = {
    id: newId(),
    tenantId: input.tenantId ?? null,
    actor: input.actor,
    action: input.action,
    targetId: input.targetId ?? null,
    detail: input.detail === undefined ? null : JSON.stringify(input.detail),
    createdAt: now,
  }
  await db.insert(auditLogs).values(row)
  return row
}
