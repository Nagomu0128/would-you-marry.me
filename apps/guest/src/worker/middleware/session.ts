// セッション・テナント・期間・停止・ニックネームの検証（docs/spec/api.md「参加者向け API」の共通の確認）
import * as Sentry from '@sentry/cloudflare'
import {
  type CoupleAccess,
  type Db,
  type Guest,
  getTenant,
  getVisitorSession,
  touchGuestLastSeen,
  touchVisitorSession,
  type VisitorSession,
} from '@wym/db'
import { ApiError, canGuestUse, LAST_SEEN_UPDATE_INTERVAL_MS, sha256Hex } from '@wym/shared'
import type { Context, MiddlewareHandler } from 'hono'
import { readSessionCookie } from '../lib/cookie'
import { isUuid } from '../lib/ids'
import { logEvent } from '../lib/logger'
import { now } from '../lib/time'
import type { GuestEnv } from '../types'

export type ResolvedGuestSession = {
  idHash: string
  session: VisitorSession
  guest: Guest
}

export type ResolvedCoupleSession = {
  idHash: string
  session: VisitorSession
  coupleAccess: CoupleAccess
}

/**
 * このテナントの有効な参加者セッションを探す。なければ null。
 * 有効 = `wym_g_{tenantId}` のセッションが kind=guest で、セッションのテナントが一致すること。
 * （期間・停止の確認は含まない。それは `guestSession` が行う）
 */
export async function resolveGuestSession(
  c: Context,
  db: Db,
  tenantId: string,
): Promise<ResolvedGuestSession | null> {
  if (!isUuid(tenantId)) return null
  const sessionId = readSessionCookie(c, 'guest', tenantId)
  if (!sessionId) return null
  const idHash = await sha256Hex(sessionId)
  // getVisitorSession は tenant_id で絞り込むので、他テナントのセッションは見つからない
  const detail = await getVisitorSession(db, tenantId, idHash)
  if (detail?.session.kind !== 'guest' || !detail.guest) return null
  return { idHash, session: detail.session, guest: detail.guest }
}

/**
 * このテナントの有効な新郎新婦セッションを探す。なければ null。
 * 有効 = `wym_c_{tenantId}` のセッションが kind=couple で、新郎新婦用 URL が再発行などで
 * 無効になっていない（`couple_accesses.revoked_at` が空）こと。
 * （期間・停止の確認は含まない）
 */
export async function resolveCoupleSession(
  c: Context,
  db: Db,
  tenantId: string,
): Promise<ResolvedCoupleSession | null> {
  if (!isUuid(tenantId)) return null
  const sessionId = readSessionCookie(c, 'couple', tenantId)
  if (!sessionId) return null
  const idHash = await sha256Hex(sessionId)
  const detail = await getVisitorSession(db, tenantId, idHash)
  if (detail?.session.kind !== 'couple') return null
  const access = detail.coupleAccess
  if (!access || access.revokedAt !== null) return null
  return { idHash, session: detail.session, coupleAccess: access }
}

/** `waitUntil` が使えない（テストなど）ときは、完了を待たずに実行する */
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
 * `/api/t/:tenantId/*` の共通処理。順序は api.md のとおり:
 * セッション → テナントの存在 → 停止中 → 期間 → （ニックネームは `requireNickname`）
 *
 * 通ったあとは `c.var.tenant`・`c.var.guest`・`c.var.tenantId` が使える。
 * URL のテナント ID とセッションのテナントが一致することは、ここで保証している
 * （セッションは URL のテナント ID で、tenant_id を条件にして探す）。
 */
export const guestSession: MiddlewareHandler<GuestEnv> = async (c, next) => {
  const urlTenantId = c.req.param('tenantId') ?? ''
  const db = c.var.db

  const resolved = await resolveGuestSession(c, db, urlTenantId)
  if (!resolved) throw new ApiError('UNAUTHENTICATED', 'authentication required')

  const tenant = await getTenant(db, urlTenantId)
  if (!tenant || tenant.dataDeletedAt !== null) {
    throw new ApiError('TENANT_NOT_FOUND', 'tenant not found')
  }
  if (tenant.suspended) throw new ApiError('TENANT_SUSPENDED', 'tenant is suspended')

  const current = now()
  if (!canGuestUse(tenant, current)) throw new ApiError('PERIOD_ENDED', 'period has ended')

  // セッションの tenant_id で絞り込み済みだが、念のため最終確認する
  if (resolved.session.tenantId !== tenant.id || resolved.guest.tenantId !== tenant.id) {
    throw new ApiError('UNAUTHENTICATED', 'authentication required')
  }

  c.set('tenant', tenant)
  c.set('guest', resolved.guest)
  c.set('tenantId', tenant.id)
  Sentry.setTag('tenantId', tenant.id)

  // last_seen_at は 10 分に 1 回だけ更新する（書き込みを減らす。応答は待たせない）
  const t = current.getTime()
  runInBackground(
    c,
    Promise.all([
      touchVisitorSession(db, tenant.id, resolved.idHash, LAST_SEEN_UPDATE_INTERVAL_MS, t),
      touchGuestLastSeen(db, tenant.id, resolved.guest.id, LAST_SEEN_UPDATE_INTERVAL_MS, t),
    ]),
  )

  await next()
}

/** ニックネーム未登録なら NICKNAME_REQUIRED。`me` 系以外のルートの前に置く */
export const requireNickname: MiddlewareHandler<GuestEnv> = async (c, next) => {
  if (c.var.guest.nickname === null) {
    throw new ApiError('NICKNAME_REQUIRED', 'nickname is required')
  }
  await next()
}
