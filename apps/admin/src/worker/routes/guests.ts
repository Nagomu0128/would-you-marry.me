// 参加者（FR-A-16）
import { createDb, getGuest, listGuests, recordAuditLog, setGuestNickname } from '@wym/db'
import {
  type AdminGuest,
  type AdminGuestListResponse,
  ApiError,
  nicknameKey,
  validateNickname,
} from '@wym/shared'
import { Hono } from 'hono'
import { log } from '../lib/log'
import { requireActiveTenant } from '../lib/tenant'
import type { AppBindings } from '../types'

export const guestRoutes = new Hono<AppBindings>()

guestRoutes.get('/tenants/:tenantId/guests', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))
  const rows = await listGuests(db, tenant.id)
  // ニックネーム登録済みの参加者だけ（「参加者」は登録済みの人を指す）
  const guests = rows.flatMap((g): AdminGuest[] =>
    g.nickname === null
      ? []
      : [
          {
            id: g.id,
            nickname: g.nickname,
            photoCount: g.photoCount,
            createdAt: new Date(g.createdAt).toISOString(),
          },
        ],
  )
  const body: AdminGuestListResponse = { guests }
  return c.json(body)
})

guestRoutes.patch('/tenants/:tenantId/guests/:guestId', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))
  const guestId = c.req.param('guestId')

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    body = null
  }
  const raw = typeof body === 'object' && body !== null && 'nickname' in body ? body.nickname : ''
  const validation = validateNickname(typeof raw === 'string' ? raw : '')
  if (!validation.ok) {
    throw new ApiError('VALIDATION_ERROR', 'invalid nickname', {
      fields: { nickname: validation.field },
    })
  }

  const before = await getGuest(db, tenant.id, guestId)
  // 未登録の参加者は一覧に出ないので、対象にしない
  if (!before || before.nickname === null) throw new ApiError('NOT_FOUND', 'guest not found')

  const result = await setGuestNickname(db, tenant.id, guestId, {
    nickname: validation.value,
    nicknameKey: nicknameKey(validation.value),
  })
  if (!result.ok) {
    if (result.reason === 'taken') throw new ApiError('NICKNAME_TAKEN', 'nickname already in use')
    throw new ApiError('NOT_FOUND', 'guest not found')
  }

  await recordAuditLog(db, {
    tenantId: tenant.id,
    actor: c.var.adminEmail,
    action: 'guest.rename',
    targetId: guestId,
    detail: { before: before.nickname, after: result.guest.nickname },
  })
  log('info', 'guest.rename', { tenantId: tenant.id })
  return c.json({ id: guestId, nickname: result.guest.nickname })
})
