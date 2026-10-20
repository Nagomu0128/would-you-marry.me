// GET /couple/:tenantId?t={token}（新郎新婦用 URL、FR-C-01）。docs/spec/api.md「ページ遷移」の 1〜3
// エラーは `/error?code=...&audience=couple` へ（エラー画面で新郎新婦向けの文言を出すため）。
// `/couple/:tenantId/login` など、これ以外の `/couple/*` は SPA（index.ts の notFound）が返す。
// `/api/couple/:tenantId/*`（パスコード入力、写真など）は T09 でここに足す。
import { findActiveCoupleAccessByToken, getTenant } from '@wym/db'
import { canCoupleUse } from '@wym/shared'
import { Hono } from 'hono'
import { setCouplePendingCookie } from '../lib/cookie'
import { isUuid } from '../lib/ids'
import { logEvent } from '../lib/logger'
import { errorPath, redirectNoStore } from '../lib/redirect'
import { now } from '../lib/time'
import { resolveCoupleSession } from '../middleware/session'
import type { AppEnv } from '../types'

export const couplePageRoutes = new Hono<AppEnv>()

couplePageRoutes.get('/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId')
  const db = c.var.db
  const fail = (code: Parameters<typeof errorPath>[0]) =>
    redirectNoStore(c, errorPath(code, 'couple'))

  if (!isUuid(tenantId)) return fail('TENANT_NOT_FOUND')
  const tenant = await getTenant(db, tenantId)
  if (!tenant || tenant.dataDeletedAt !== null) return fail('TENANT_NOT_FOUND')
  c.set('tenantId', tenant.id)

  // 1. このテナントの有効な新郎新婦セッションがある
  if (await resolveCoupleSession(c, db, tenant.id)) {
    return redirectNoStore(c, `/couple/${tenant.id}/photos`)
  }

  // 2. 停止中・期間外、またはトークンが無効
  if (tenant.suspended) return fail('TENANT_SUSPENDED')
  if (!canCoupleUse(tenant, now())) return fail('PERIOD_ENDED')
  const token = c.req.query('t')
  if (!token) return fail('UNAUTHENTICATED')
  if (!(await findActiveCoupleAccessByToken(db, tenant.id, token)))
    return fail('COUPLE_LINK_INVALID')

  // 3. トークンを pending Cookie に入れ、URL から取り除く
  setCouplePendingCookie(c, token)
  logEvent('couple_link_opened', { tenantId: tenant.id })
  return redirectNoStore(c, `/couple/${tenant.id}/login`)
})
