// 席次表 PDF とコース表の画像（FR-A-05 / FR-A-06）
import {
  addCourseMenuImage,
  courseMenuImageKey,
  createDb,
  deleteCourseMenuImage,
  getCourseMenuImage,
  getSeatingChart,
  listCourseMenuImages,
  newId,
  recordAuditLog,
  reorderCourseMenuImages,
  seatingChartKey,
  upsertSeatingChart,
} from '@wym/db'
import {
  type AddCourseMenuImageResponse,
  ApiError,
  COURSE_MENU_IMAGE_MAX_BYTES,
  type CourseMenuResponse,
  SEATING_CHART_MAX_BYTES,
  type SeatingChartResponse,
} from '@wym/shared'
import { Hono } from 'hono'
import { detectImageContentType, isPdf } from '../lib/file-type'
import { log } from '../lib/log'
import { deleteObjectsQuietly, readBodyLimited, serveR2Object } from '../lib/r2'
import { requireActiveTenant } from '../lib/tenant'
import type { AppBindings } from '../types'

export const contentRoutes = new Hono<AppBindings>()

/** multipart の枠（境界・項目名）の分として、ファイルの上限に足す余裕 */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024

function declaredLength(header: string | undefined): number | null {
  if (header === undefined || !/^\d+$/.test(header)) return null
  return Number(header)
}

function imageUrl(tenantId: string, imageId: string): string {
  return `/api/tenants/${tenantId}/course-menu/images/${imageId}`
}

// --- 席次表 ---

contentRoutes.put('/tenants/:tenantId/seating-chart', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))

  // 本文を読む前に、宣言されたサイズで断る
  const length = declaredLength(c.req.header('Content-Length'))
  if (length !== null && length > SEATING_CHART_MAX_BYTES) {
    throw new ApiError('FILE_TOO_LARGE', 'file too large')
  }
  const body = await readBodyLimited(c.req.raw.body, SEATING_CHART_MAX_BYTES)
  if (body === null) throw new ApiError('FILE_TOO_LARGE', 'file too large')
  if (!isPdf(body)) throw new ApiError('UNSUPPORTED_FILE_TYPE', 'only PDF is accepted')

  // 差し替えのたびに新しいキーで保存し、D1 を更新してから古いファイルを消す
  const key = seatingChartKey(tenant.id, newId())
  await c.env.BUCKET.put(key, body, { httpMetadata: { contentType: 'application/pdf' } })
  let result: Awaited<ReturnType<typeof upsertSeatingChart>>
  try {
    result = await upsertSeatingChart(db, tenant.id, { r2Key: key, sizeBytes: body.byteLength })
  } catch (error) {
    await deleteObjectsQuietly(c.env.BUCKET, [key], tenant.id)
    throw error
  }
  if (result.replacedR2Key) {
    await deleteObjectsQuietly(c.env.BUCKET, [result.replacedR2Key], tenant.id)
  }

  await recordAuditLog(db, {
    tenantId: tenant.id,
    actor: c.var.adminEmail,
    action: 'seating_chart.upload',
    detail: { sizeBytes: body.byteLength },
  })
  log('info', 'seating_chart.upload', { tenantId: tenant.id })

  const res: SeatingChartResponse = {
    sizeBytes: result.chart.sizeBytes,
    uploadedAt: new Date(result.chart.uploadedAt).toISOString(),
  }
  return c.json(res)
})

// Hono は GET のハンドラーで HEAD にも応える。HEAD では本文を読まない（serveR2Object）
contentRoutes.get('/tenants/:tenantId/seating-chart', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))
  const chart = await getSeatingChart(db, tenant.id)
  if (!chart) throw new ApiError('NOT_FOUND', 'seating chart not registered')
  return serveR2Object(c, c.env.BUCKET, chart.r2Key, {
    contentType: 'application/pdf',
    cacheControl: 'private, no-cache',
  })
})

// --- コース表 ---

contentRoutes.get('/tenants/:tenantId/course-menu', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))
  const images = await listCourseMenuImages(db, tenant.id)
  const body: CourseMenuResponse = {
    images: images.map((image) => ({ id: image.id, url: imageUrl(tenant.id, image.id) })),
  }
  return c.json(body)
})

contentRoutes.post('/tenants/:tenantId/course-menu/images', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))

  const length = declaredLength(c.req.header('Content-Length'))
  if (length !== null && length > COURSE_MENU_IMAGE_MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
    throw new ApiError('FILE_TOO_LARGE', 'file too large')
  }
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'multipart/form-data is required', {
      fields: { file: 'REQUIRED' },
    })
  }
  const file = form.get('file')
  if (typeof file === 'string' || file === null) {
    throw new ApiError('VALIDATION_ERROR', 'file is required', { fields: { file: 'REQUIRED' } })
  }
  if (file.size > COURSE_MENU_IMAGE_MAX_BYTES)
    throw new ApiError('FILE_TOO_LARGE', 'file too large')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const contentType = detectImageContentType(bytes)
  if (contentType === null) {
    throw new ApiError('UNSUPPORTED_FILE_TYPE', 'only JPEG and PNG are accepted')
  }

  const id = newId()
  const key = courseMenuImageKey(tenant.id, id, contentType)
  await c.env.BUCKET.put(key, bytes, { httpMetadata: { contentType } })
  try {
    await addCourseMenuImage(db, tenant.id, {
      id,
      r2Key: key,
      contentType,
      sizeBytes: bytes.byteLength,
    })
  } catch (error) {
    await deleteObjectsQuietly(c.env.BUCKET, [key], tenant.id)
    throw error
  }

  await recordAuditLog(db, {
    tenantId: tenant.id,
    actor: c.var.adminEmail,
    action: 'course_menu.add',
    targetId: id,
    detail: { sizeBytes: bytes.byteLength, contentType },
  })
  log('info', 'course_menu.add', { tenantId: tenant.id })

  const res: AddCourseMenuImageResponse = { image: { id, url: imageUrl(tenant.id, id) } }
  return c.json(res, 201)
})

// GET は HEAD にも応える
contentRoutes.get('/tenants/:tenantId/course-menu/images/:imageId', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))
  const image = await getCourseMenuImage(db, tenant.id, c.req.param('imageId'))
  if (!image) throw new ApiError('NOT_FOUND', 'image not found')
  return serveR2Object(c, c.env.BUCKET, image.r2Key, {
    contentType: image.contentType,
    cacheControl: 'private, max-age=31536000, immutable',
  })
})

contentRoutes.delete('/tenants/:tenantId/course-menu/images/:imageId', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))
  const imageId = c.req.param('imageId')
  const deleted = await deleteCourseMenuImage(db, tenant.id, imageId)
  if (!deleted) throw new ApiError('NOT_FOUND', 'image not found')
  await deleteObjectsQuietly(c.env.BUCKET, [deleted.r2Key], tenant.id)

  await recordAuditLog(db, {
    tenantId: tenant.id,
    actor: c.var.adminEmail,
    action: 'course_menu.remove',
    targetId: imageId,
  })
  log('info', 'course_menu.remove', { tenantId: tenant.id })
  return c.body(null, 204)
})

contentRoutes.put('/tenants/:tenantId/course-menu/order', async (c) => {
  const db = createDb(c.env.DB)
  const tenant = await requireActiveTenant(db, c.req.param('tenantId'))

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    body = null
  }
  const imageIds =
    typeof body === 'object' && body !== null && 'imageIds' in body ? body.imageIds : undefined
  if (!Array.isArray(imageIds) || !imageIds.every((id): id is string => typeof id === 'string')) {
    throw new ApiError('VALIDATION_ERROR', 'imageIds must be an array of strings', {
      fields: { imageIds: 'INVALID' },
    })
  }

  // 過不足・重複・他のテナントの ID があれば並べ替えない
  const ok = await reorderCourseMenuImages(db, tenant.id, imageIds)
  if (!ok) {
    throw new ApiError('VALIDATION_ERROR', 'imageIds must list every image exactly once', {
      fields: { imageIds: 'INVALID' },
    })
  }

  await recordAuditLog(db, {
    tenantId: tenant.id,
    actor: c.var.adminEmail,
    action: 'course_menu.reorder',
    detail: { imageIds },
  })
  log('info', 'course_menu.reorder', { tenantId: tenant.id })

  return c.body(null, 204)
})
