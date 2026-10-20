// 写真（FR-A-11）
import {
  createDb,
  deletePhotoAsAdmin,
  getPhoto,
  InvalidCursorError,
  listTimeline,
  type Photo,
  recordAuditLog,
} from '@wym/db'
import {
  type AdminPhotoListResponse,
  ApiError,
  LIST_LIMIT_DEFAULT,
  LIST_LIMIT_MAX,
  type StaffPhoto,
} from '@wym/shared'
import { Hono } from 'hono'
import { log } from '../lib/log'
import { deleteObjectsQuietly, serveR2Object } from '../lib/r2'
import { requireActiveTenant } from '../lib/tenant'
import type { AppBindings } from '../types'

export const photoRoutes = new Hono<AppBindings>()

const IMMUTABLE = 'private, max-age=31536000, immutable'

function photoUrl(tenantId: string, photoId: string, kind: 'thumb' | 'display' | 'original') {
  return `/api/tenants/${tenantId}/photos/${photoId}/${kind}`
}

function toStaffPhoto(
  tenantId: string,
  photo: Photo,
  uploader: { id: string; nickname: string | null },
): StaffPhoto {
  return {
    id: photo.id,
    // ニックネーム未登録の参加者は写真を投稿できない（登録後に投稿する）ので、空はありえない
    uploader: { id: uploader.id, nickname: uploader.nickname ?? '' },
    likeCount: photo.likeCount,
    width: photo.width,
    height: photo.height,
    createdAt: new Date(photo.createdAt).toISOString(),
    urls: {
      thumb: photoUrl(tenantId, photo.id, 'thumb'),
      display: photoUrl(tenantId, photo.id, 'display'),
      original: photoUrl(tenantId, photo.id, 'original'),
    },
  }
}

/** `?limit=`: 既定 30、最大 50。整数でなければ VALIDATION_ERROR */
function parseLimit(value: string | undefined): number {
  if (value === undefined) return LIST_LIMIT_DEFAULT
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new ApiError('VALIDATION_ERROR', 'invalid limit', { fields: { limit: 'INVALID' } })
  }
  return Math.min(Number(value), LIST_LIMIT_MAX)
}

photoRoutes.get('/tenants/:tenantId/photos', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))
  const limit = parseLimit(c.req.query('limit'))
  let page: Awaited<ReturnType<typeof listTimeline>>
  try {
    page = await listTimeline(db, tenant.id, { cursor: c.req.query('cursor'), limit })
  } catch (error) {
    if (error instanceof InvalidCursorError) {
      throw new ApiError('VALIDATION_ERROR', 'invalid cursor', { fields: { cursor: 'INVALID' } })
    }
    throw error
  }
  const body: AdminPhotoListResponse = {
    photos: page.photos.map((p) => toStaffPhoto(tenant.id, p.photo, p.uploader)),
    nextCursor: page.nextCursor,
  }
  return c.json(body)
})

photoRoutes.delete('/tenants/:tenantId/photos/:photoId', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))
  const photoId = c.req.param('photoId')
  // 1. D1 から消す（いいねは外部キーでまとめて消える）。ここで画面から見えなくなる
  const deleted = await deletePhotoAsAdmin(db, tenant.id, photoId)
  if (!deleted) throw new ApiError('NOT_FOUND', 'photo not found')
  // 2. R2 の 3 つを消す。失敗してもログに残すだけ
  await deleteObjectsQuietly(
    c.env.BUCKET,
    [deleted.originalKey, deleted.displayKey, deleted.thumbKey],
    tenant.id,
  )
  await recordAuditLog(db, {
    tenantId: tenant.id,
    actor: c.var.adminEmail,
    action: 'photo.delete',
    targetId: photoId,
    detail: { guestId: deleted.guestId },
  })
  log('info', 'photo.delete', { tenantId: tenant.id })
  return c.body(null, 204)
})

// GET は HEAD にも応える
photoRoutes.get('/tenants/:tenantId/photos/:photoId/:kind{thumb|display|original}', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))
  const photo = await getPhoto(db, tenant.id, c.req.param('photoId'))
  if (!photo) throw new ApiError('NOT_FOUND', 'photo not found')

  const kind = c.req.param('kind')
  if (kind === 'thumb') {
    return serveR2Object(c, c.env.BUCKET, photo.thumbKey, {
      contentType: 'image/jpeg',
      cacheControl: IMMUTABLE,
    })
  }
  if (kind === 'display') {
    return serveR2Object(c, c.env.BUCKET, photo.displayKey, {
      contentType: 'image/jpeg',
      cacheControl: IMMUTABLE,
    })
  }
  const ext = photo.originalContentType === 'image/png' ? 'png' : 'jpg'
  return serveR2Object(c, c.env.BUCKET, photo.originalKey, {
    contentType: photo.originalContentType,
    cacheControl: IMMUTABLE,
    contentDisposition:
      c.req.query('download') === '1'
        ? `attachment; filename="wedding-photo-${photo.id}.${ext}"`
        : undefined,
  })
})
