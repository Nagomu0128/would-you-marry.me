// GET /join/:tenantId?t={token}（参加、FR-G-01 / FR-G-02）。docs/spec/api.md「ページ遷移」の 1〜6
import { createGuest, createVisitorSession, findActiveJoinToken, getTenant } from '@wym/db'
import { canJoin, randomSessionId, sha256Hex } from '@wym/shared'
import { Hono } from 'hono'
import { setSessionCookie } from '../lib/cookie'
import { isUuid } from '../lib/ids'
import { logEvent } from '../lib/logger'
import { errorPath, redirectNoStore } from '../lib/redirect'
import { now } from '../lib/time'
import { resolveGuestSession } from '../middleware/session'
import type { AppEnv } from '../types'

export const joinRoutes = new Hono<AppEnv>()

joinRoutes.get('/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  const db = c.var.db

  // 同じ IP アドレスから 1 分に 200 回まで（D-38）。バインディングがない環境では制限しない
  const limiter = c.env.JOIN_RATE_LIMITER as RateLimit | undefined
  if (limiter) {
    try {
      const { success } = await limiter.limit({
        key: c.req.header('CF-Connecting-IP') ?? 'unknown',
      })
      if (!success) {
        logEvent('join_rate_limited', { tenantId: isUuid(tenantId) ? tenantId : undefined })
        return redirectNoStore(c, errorPath('RATE_LIMITED'))
      }
    } catch {
      // 制限の仕組みの障害で参加できなくならないよう、制限せずに続ける
      logEvent('join_rate_limiter_failed', {}, 'warn')
    }
  }

  // 1. テナントがない、またはデータ削除済み
  if (!isUuid(tenantId)) return redirectNoStore(c, errorPath('TENANT_NOT_FOUND'))
  const tenant = await getTenant(db, tenantId)
  if (!tenant || tenant.dataDeletedAt !== null) {
    return redirectNoStore(c, errorPath('TENANT_NOT_FOUND'))
  }
  c.set('tenantId', tenant.id)

  // 2. このテナントの有効な参加者セッションがある（新しい参加者は作らない）
  const existing = await resolveGuestSession(c, db, tenant.id)
  if (existing) {
    const next = existing.guest.nickname === null ? 'nickname' : ''
    return redirectNoStore(c, `/t/${tenant.id}${next ? `/${next}` : ''}`)
  }

  // 3. 停止中
  if (tenant.suspended) return redirectNoStore(c, errorPath('TENANT_SUSPENDED'))

  // 4. 参加受付期間外
  if (!canJoin(tenant, now())) return redirectNoStore(c, errorPath('OUTSIDE_JOINING_PERIOD'))

  // 5. トークンが有効なものと一致しない（このテナントのトークンだけを照合する）
  const token = c.req.query('t')
  if (!token || !(await findActiveJoinToken(db, tenant.id, token))) {
    return redirectNoStore(c, errorPath('JOIN_TOKEN_INVALID'))
  }

  // 6. 参加者とセッションを作る。D1 にはセッション ID のハッシュだけを保存する
  const guest = await createGuest(db, tenant.id)
  const sessionId = randomSessionId()
  await createVisitorSession(db, {
    idHash: await sha256Hex(sessionId),
    tenantId: tenant.id,
    kind: 'guest',
    guestId: guest.id,
  })
  setSessionCookie(c, 'guest', tenant.id, sessionId)
  logEvent('guest_joined', { tenantId: tenant.id })
  // リダイレクトで URL から参加トークンを消す
  return redirectNoStore(c, `/t/${tenant.id}/nickname`)
})
