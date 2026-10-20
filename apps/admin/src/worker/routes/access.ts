// 参加 URL と新郎新婦用 URL（FR-A-07 / FR-A-08 / FR-A-12）
import {
  createDb,
  getActiveCoupleAccess,
  getActiveJoinToken,
  issueCoupleAccess,
  issueJoinToken,
  recordAuditLog,
  type Tenant,
} from '@wym/db'
import {
  type CoupleAccessResponse,
  generatePasscode,
  getPhaseBoundaries,
  hashPasscode,
  type IssueCoupleAccessResponse,
  type JoinUrlResponse,
  randomToken,
} from '@wym/shared'
import { Hono } from 'hono'
import { log } from '../lib/log'
import { requireActiveTenant } from '../lib/tenant'
import type { AppBindings } from '../types'

export const accessRoutes = new Hono<AppBindings>()

function joinUrlBody(
  guestOrigin: string,
  tenant: Tenant,
  token: string,
  issuedAt: number,
): Exclude<JoinUrlResponse, { url: null }> {
  // 参加できる期間は [joiningStart, viewingStart)（終わりは含まない境界）
  const b = getPhaseBoundaries(tenant.eventDate)
  return {
    url: `${guestOrigin}/join/${tenant.id}?t=${token}`,
    issuedAt: new Date(issuedAt).toISOString(),
    joiningStart: b.joiningStart.toISOString(),
    joiningEnd: b.viewingStart.toISOString(),
  }
}

accessRoutes.get('/tenants/:tenantId/join-url', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))
  const active = await getActiveJoinToken(db, tenant.id)
  const body: JoinUrlResponse = active
    ? joinUrlBody(c.env.GUEST_ORIGIN, tenant, active.token, active.createdAt)
    : { url: null }
  return c.json(body)
})

accessRoutes.post('/tenants/:tenantId/join-url', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))
  // 古いトークンは無効になるが、参加者のセッションはそのまま
  const issued = await issueJoinToken(db, tenant.id, randomToken())
  // トークンは監査ログ・ログに入れない
  await recordAuditLog(db, {
    tenantId: tenant.id,
    actor: c.var.adminEmail,
    action: 'join_url.issue',
  })
  log('info', 'join_url.issue', { tenantId: tenant.id })
  return c.json(joinUrlBody(c.env.GUEST_ORIGIN, tenant, issued.token, issued.createdAt))
})

accessRoutes.get('/tenants/:tenantId/couple-access', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))
  const active = await getActiveCoupleAccess(db, tenant.id)
  // パスコードは返さない（ハッシュしか持っていない）
  const body: CoupleAccessResponse = active
    ? {
        url: `${c.env.GUEST_ORIGIN}/couple/${tenant.id}?t=${active.token}`,
        issuedAt: new Date(active.createdAt).toISOString(),
        termsAgreedAt:
          active.termsAgreedAt === null ? null : new Date(active.termsAgreedAt).toISOString(),
      }
    : { url: null }
  return c.json(body)
})

accessRoutes.post('/tenants/:tenantId/couple-access', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))
  const passcode = generatePasscode()
  // 古いものの無効化と、新郎新婦のセッションの削除を含む
  const issued = await issueCoupleAccess(db, tenant.id, {
    token: randomToken(),
    passcodeHash: await hashPasscode(passcode),
  })
  // パスコード・トークンは監査ログ・ログに入れない
  await recordAuditLog(db, {
    tenantId: tenant.id,
    actor: c.var.adminEmail,
    action: 'couple_access.issue',
  })
  log('info', 'couple_access.issue', { tenantId: tenant.id })

  const body: IssueCoupleAccessResponse = {
    url: `${c.env.GUEST_ORIGIN}/couple/${tenant.id}?t=${issued.token}`,
    passcode,
    issuedAt: new Date(issued.createdAt).toISOString(),
  }
  // パスコードを含むので、キャッシュさせない
  c.header('Cache-Control', 'no-store')
  return c.json(body)
})
