// GET /api/t/:tenantId/me、PUT /api/t/:tenantId/me/nickname（FR-G-03 / FR-G-04）
import { countGuestPhotos, getGuest, recordGuestTermsAgreement, setGuestNickname } from '@wym/db'
import {
  ApiError,
  type GuestMeResponse,
  getTenantPhase,
  nicknameKey,
  PHOTO_LIMIT_PER_GUEST,
  validateNickname,
} from '@wym/shared'
import { Hono } from 'hono'
import { logEvent } from '../lib/logger'
import { now } from '../lib/time'
import type { GuestEnv } from '../types'

export const guestMeRoutes = new Hono<GuestEnv>()

type MeSource = Pick<GuestEnv['Variables'], 'tenant' | 'guest' | 'db'>

async function buildMe({ tenant, guest, db }: MeSource): Promise<GuestMeResponse> {
  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      eventDate: tenant.eventDate,
      phase: getTenantPhase(tenant.eventDate, now()),
    },
    me: {
      id: guest.id,
      nickname: guest.nickname,
      termsAgreed: guest.termsAgreedAt !== null,
      photoCount: await countGuestPhotos(db, tenant.id, guest.id),
      photoLimit: PHOTO_LIMIT_PER_GUEST,
    },
  }
}

guestMeRoutes.get('/', async (c) => {
  return c.json(await buildMe({ tenant: c.var.tenant, guest: c.var.guest, db: c.var.db }))
})

guestMeRoutes.put('/nickname', async (c) => {
  const { db, tenant, guest } = c.var

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    body = null
  }
  const input = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}

  const validation = validateNickname(typeof input.nickname === 'string' ? input.nickname : '')
  if (!validation.ok) {
    throw new ApiError('VALIDATION_ERROR', 'invalid nickname', {
      fields: { nickname: validation.field },
    })
  }

  // 初回の登録（規約に未同意）では、同意が必須
  const isFirstAgreement = guest.termsAgreedAt === null
  if (isFirstAgreement && input.agreeToTerms !== true) {
    throw new ApiError('TERMS_NOT_AGREED', 'agreement to terms is required')
  }

  const result = await setGuestNickname(db, tenant.id, guest.id, {
    nickname: validation.value,
    nicknameKey: nicknameKey(validation.value),
  })
  if (!result.ok) {
    if (result.reason === 'taken') throw new ApiError('NICKNAME_TAKEN', 'nickname already in use')
    throw new ApiError('UNAUTHENTICATED', 'authentication required')
  }

  let updated = result.guest
  if (isFirstAgreement) {
    await recordGuestTermsAgreement(db, tenant.id, guest.id)
    updated = (await getGuest(db, tenant.id, guest.id)) ?? updated
  }

  logEvent(guest.nickname === null ? 'nickname_registered' : 'nickname_changed', {
    tenantId: tenant.id,
  })
  return c.json(await buildMe({ tenant, guest: updated, db }))
})
