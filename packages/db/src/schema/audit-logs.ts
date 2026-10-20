import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** 監査ログに記録する操作（docs/spec/database.md） */
export const AUDIT_ACTIONS = [
  'tenant.create',
  'tenant.update',
  'tenant.suspend',
  'tenant.resume',
  'tenant.delete',
  'seating_chart.upload',
  'course_menu.add',
  'course_menu.remove',
  'course_menu.reorder',
  'join_url.issue',
  'couple_access.issue',
  'photo.delete',
  'guest.rename',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

/** 管理操作の記録。tenant_id は外部キーにしない（テナントのデータ削除後も残す） */
export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id'),
    /** 管理者のメールアドレス。定期処理は `system` */
    actor: text('actor').notNull(),
    action: text('action', { enum: AUDIT_ACTIONS }).notNull(),
    targetId: text('target_id'),
    /** JSON 文字列 */
    detail: text('detail'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('audit_logs_tenant_created_idx').on(t.tenantId, t.createdAt)],
)

export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
