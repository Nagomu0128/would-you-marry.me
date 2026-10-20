// 新郎新婦向け API（/api/couple/:tenantId/*）の共通の確認（docs/spec/api.md「新郎新婦向け API」）
import * as Sentry from '@sentry/cloudflare'
import { type Db, getTenant, type Tenant, touchVisitorSession } from '@wym/db'
import { ApiError, canCoupleUse, LAST_SEEN_UPDATE_INTERVAL_MS } from '@wym/shared'
import type { Context, MiddlewareHandler } from 'hono'
import { isUuid } from '../lib/ids'
import { logEvent } from '../lib/logger'
import { now } from '../lib/time'
import type { CoupleEnv } from '../types'
import { resolveCoupleSession } from './session'

/**
 * テナントの存在・停止・新郎新婦の利用期間を確認する。
 * 存在しない・削除済みは TENANT_NOT_FOUND、停止中は TENANT_SUSPENDED、期間外は PERIOD_ENDED。
 */
export async function requireCoupleTenant(db: Db, tenantId: string): Promise<Tenant> {
  const tenant = isUuid(tenantId) ? await getTenant(db, tenantId) : undefined
  if (!tenant || tenant.dataDeletedAt !== null) {
    throw new ApiError('TENANT_NOT_FOUND', 'tenant not found')
  }
  if (tenant.suspended) throw new ApiError('TENANT_SUSPENDED', 'tenant is suspended')
  if (!canCoupleUse(tenant, now())) throw new ApiError('PERIOD_ENDED', 'period has ended')
  return tenant
}

function runInBackground(c: Context, task: Promise<unknown>): void {
  const guarded = task.catch((error: unknown) => {
    logEvent(
      'background_task_failed',
      { errorName: error instanceof Error ? error.name : 'unknown' },
      'warn',
    )
  })
  try {
    c.executionCtx.waitUntil(guarded)
  } catch {
    // executionCtx がない環境。guarded はそのまま実行される
  }
}

/**
 * `login` 以外の共通処理。順序は api.md のとおり:
 * セッション → テナントの存在 → 停止中 → 期間。
 * 通ったあとは `c.var.tenant`・`c.var.tenantId` が使える。
 */
export const coupleSession: MiddlewareHandler<CoupleEnv> = async (c, next) => {
  const urlTenantId = c.req.param('tenantId') ?? ''
  const db = c.var.db

  const resolved = await resolveCoupleSession(c, db, urlTenantId)
  if (!resolved) throw new ApiError('UNAUTHENTICATED', 'authentication required')

  const tenant = await requireCoupleTenant(db, urlTenantId)
  if (resolved.session.tenantId !== tenant.id || resolved.coupleAccess.tenantId !== tenant.id) {
    throw new ApiError('UNAUTHENTICATED', 'authentication required')
  }

  c.set('tenant', tenant)
  c.set('tenantId', tenant.id)
  Sentry.setTag('tenantId', tenant.id)

  // last_seen_at は 10 分に 1 回だけ更新する（応答は待たせない）
  runInBackground(
    c,
    touchVisitorSession(
      db,
      tenant.id,
      resolved.idHash,
      LAST_SEEN_UPDATE_INTERVAL_MS,
      now().getTime(),
    ),
  )

  await next()
}
