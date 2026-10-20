// 新郎新婦向け API（FR-C-01〜FR-C-06）。パスは /api/couple/:tenantId 以下
// 新郎新婦は写真の投稿・削除・いいねができないので、そのルートは作らない。
import * as Sentry from '@sentry/cloudflare'
import {
  type CoupleAccess,
  createVisitorSession,
  findActiveCoupleAccessByToken,
  getPhoto,
  InvalidCursorError,
  listRanking,
  listTimeline,
  listUploaders,
  recordCoupleFailedAttempt,
  recordCoupleTermsAgreement,
  resetCoupleFailedAttempts,
} from '@wym/db'
import {
  ApiError,
  type CoupleLoginResponse,
  type CoupleLoginStateResponse,
  type CoupleMeResponse,
  type CouplePhotoListResponse,
  type CoupleRankingResponse,
  getTenantPhase,
  LIST_LIMIT_DEFAULT,
  LIST_LIMIT_MAX,
  PASSCODE_LOCK_MS,
  PASSCODE_MAX_FAILED_ATTEMPTS,
  RANKING_SIZE,
  randomSessionId,
  sha256Hex,
  type UploadersResponse,
  verifyPasscode,
} from '@wym/shared'
import { type Context, Hono } from 'hono'
import { deleteCouplePendingCookie, readCouplePendingCookie, setSessionCookie } from '../lib/cookie'
import { logEvent } from '../lib/logger'
import { toStaffPhoto, withRanks } from '../lib/photo-dto'
import { isPhotoVariant, servePhotoImage } from '../lib/photo-image'
import { now } from '../lib/time'
import { coupleSession, requireCoupleTenant } from '../middleware/couple-session'
import type { AppEnv, CoupleEnv } from '../types'

export const coupleApiRoutes = new Hono<AppEnv>()

// ------------------------------------------------------------ 入場（login）

/** login 共通の確認: テナント（存在・停止・期間）→ このテナントの有効な pending トークン */
async function resolveLogin(c: Context<AppEnv>) {
  const tenant = await requireCoupleTenant(c.var.db, c.req.param('tenantId') ?? '')
  c.set('tenantId', tenant.id)
  Sentry.setTag('tenantId', tenant.id)
  const token = readCouplePendingCookie(c)
  const access = token ? await findActiveCoupleAccessByToken(c.var.db, tenant.id, token) : undefined
  if (!access) throw new ApiError('COUPLE_LINK_INVALID', 'couple link is invalid')
  return { tenant, access }
}

function lockedError(lockedUntil: number): ApiError {
  const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil - now().getTime()) / 1000))
  return new ApiError('PASSCODE_LOCKED', 'passcode is locked', { retryAfterSeconds })
}

function isLocked(access: CoupleAccess): boolean {
  return access.lockedUntil !== null && access.lockedUntil > now().getTime()
}

/** GET /login */
coupleApiRoutes.get('/login', async (c) => {
  const { tenant, access } = await resolveLogin(c)
  const body: CoupleLoginStateResponse = {
    tenantName: tenant.name,
    needsTermsAgreement: access.termsAgreedAt === null,
  }
  return c.json(body)
})

/** POST /login */
coupleApiRoutes.post('/login', async (c) => {
  const { tenant, access } = await resolveLogin(c)
  const db = c.var.db

  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    raw = null
  }
  const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}

  // 1. ロック中
  if (access.lockedUntil !== null && isLocked(access)) {
    logEvent('couple_login_locked', { tenantId: tenant.id })
    throw lockedError(access.lockedUntil)
  }

  // 2. パスコードが空。大文字と数字なので、前後の空白を除いて大文字にしてから照合する
  const passcode = typeof input.passcode === 'string' ? input.passcode.trim().toUpperCase() : ''
  if (passcode === '') {
    throw new ApiError('VALIDATION_ERROR', 'passcode is required', {
      fields: { passcode: 'REQUIRED' },
    })
  }

  // 3. 初回は規約への同意が必須（失敗回数は増やさない）
  const isFirstEntry = access.termsAgreedAt === null
  if (isFirstEntry && input.agreeToTerms !== true) {
    throw new ApiError('TERMS_NOT_AGREED', 'agreement to terms is required')
  }

  // 4. 照合
  if (!(await verifyPasscode(passcode, access.passcodeHash))) {
    const result = await recordCoupleFailedAttempt(db, tenant.id, access.id, {
      maxAttempts: PASSCODE_MAX_FAILED_ATTEMPTS,
      lockMs: PASSCODE_LOCK_MS,
    })
    if (!result) throw new ApiError('COUPLE_LINK_INVALID', 'couple link is invalid')
    if (result.locked && result.lockedUntil !== null) {
      logEvent('couple_login_locked', { tenantId: tenant.id })
      throw lockedError(result.lockedUntil)
    }
    logEvent('couple_login_failed', { tenantId: tenant.id })
    throw new ApiError('PASSCODE_INVALID', 'passcode is invalid', {
      remainingAttempts: result.remainingAttempts,
    })
  }

  // 5. 成功
  await resetCoupleFailedAttempts(db, tenant.id, access.id)
  if (isFirstEntry) await recordCoupleTermsAgreement(db, tenant.id, access.id)
  const sessionId = randomSessionId()
  await createVisitorSession(db, {
    idHash: await sha256Hex(sessionId),
    tenantId: tenant.id,
    kind: 'couple',
    coupleAccessId: access.id,
  })
  setSessionCookie(c, 'couple', tenant.id, sessionId)
  deleteCouplePendingCookie(c)
  logEvent('couple_login_succeeded', { tenantId: tenant.id })
  const body: CoupleLoginResponse = {}
  return c.json(body)
})

// ------------------------------------------------------------ ログイン後

const authed = new Hono<CoupleEnv>()
authed.use('*', coupleSession)

/** この API のルート（画像の URL の組み立てに使う） */
function basePath(c: Context<CoupleEnv>): string {
  return `/api/couple/${c.var.tenant.id}`
}

/** GET /me */
authed.get('/me', (c) => {
  const { tenant } = c.var
  const body: CoupleMeResponse = {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      eventDate: tenant.eventDate,
      phase: getTenantPhase(tenant.eventDate, now()),
    },
  }
  return c.json(body)
})

/** GET /photos?cursor=&limit=&uploaderId= */
authed.get('/photos', async (c) => {
  const { db, tenant } = c.var
  const limitText = c.req.query('limit')
  let limit = LIST_LIMIT_DEFAULT
  if (limitText !== undefined) {
    const parsed = /^\d+$/.test(limitText) ? Number(limitText) : Number.NaN
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > LIST_LIMIT_MAX) {
      throw new ApiError('VALIDATION_ERROR', 'invalid limit', { fields: { limit: 'INVALID' } })
    }
    limit = parsed
  }
  // tenant_id で絞り込むので、他テナントの参加者・存在しない参加者を指定すると空の一覧になる
  const uploaderId = c.req.query('uploaderId')

  let page: Awaited<ReturnType<typeof listTimeline>>
  try {
    page = await listTimeline(db, tenant.id, {
      cursor: c.req.query('cursor'),
      limit,
      guestId: uploaderId === undefined || uploaderId === '' ? undefined : uploaderId,
    })
  } catch (err) {
    if (err instanceof InvalidCursorError) {
      throw new ApiError('VALIDATION_ERROR', 'invalid cursor', { fields: { cursor: 'INVALID' } })
    }
    throw err
  }
  const body: CouplePhotoListResponse = {
    photos: page.photos.map((row) => toStaffPhoto(row, basePath(c))),
    nextCursor: page.nextCursor,
  }
  return c.json(body)
})

/** GET /photos/ranking */
authed.get('/photos/ranking', async (c) => {
  const rows = await listRanking(c.var.db, c.var.tenant.id, RANKING_SIZE)
  const body: CoupleRankingResponse = {
    photos: withRanks(rows.map((row) => toStaffPhoto(row, basePath(c)))),
  }
  return c.json(body)
})

/** GET /uploaders */
authed.get('/uploaders', async (c) => {
  const body: UploadersResponse = { uploaders: await listUploaders(c.var.db, c.var.tenant.id) }
  return c.json(body)
})

/** GET /photos/:photoId/(thumb|display|original)。保存（FR-C-05）には `original?download=1` */
authed.get('/photos/:photoId/:variant', async (c) => {
  const variant = c.req.param('variant')
  if (!isPhotoVariant(variant)) throw new ApiError('NOT_FOUND', 'not found')
  const photo = await getPhoto(c.var.db, c.var.tenant.id, c.req.param('photoId'))
  if (!photo) throw new ApiError('NOT_FOUND', 'photo not found')
  return servePhotoImage(c, c.env.BUCKET, photo, variant, {
    download: c.req.query('download') === '1',
  })
})

coupleApiRoutes.route('/', authed)
