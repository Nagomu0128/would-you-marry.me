// 席次表 PDF とコース表（FR-G-05 / FR-G-06）。パスは /api/t/:tenantId 以下
import { getCourseMenuImage, getSeatingChart, listCourseMenuImages } from '@wym/db'
import { ApiError, type CourseMenuResponse } from '@wym/shared'
import { Hono } from 'hono'
import { serveR2Object } from '../lib/r2'
import type { GuestEnv } from '../types'

export const guestContentRoutes = new Hono<GuestEnv>()

/** GET /seating-chart: 差し替えがあるので、毎回 ETag で確認させる */
guestContentRoutes.get('/seating-chart', async (c) => {
  const chart = await getSeatingChart(c.var.db, c.var.tenant.id)
  if (!chart) throw new ApiError('NOT_FOUND', 'seating chart not registered')
  return serveR2Object(c, c.env.BUCKET, chart.r2Key, {
    contentType: 'application/pdf',
    cacheControl: 'private, no-cache',
  })
})

/** GET /course-menu */
guestContentRoutes.get('/course-menu', async (c) => {
  const { tenant, db } = c.var
  const images = await listCourseMenuImages(db, tenant.id)
  const body: CourseMenuResponse = {
    images: images.map((image) => ({
      id: image.id,
      url: `/api/t/${tenant.id}/course-menu/images/${image.id}`,
    })),
  }
  return c.json(body)
})

/** GET /course-menu/images/:imageId: 画像の中身は変わらないので長くキャッシュする */
guestContentRoutes.get('/course-menu/images/:imageId', async (c) => {
  const image = await getCourseMenuImage(c.var.db, c.var.tenant.id, c.req.param('imageId'))
  if (!image) throw new ApiError('NOT_FOUND', 'image not found')
  return serveR2Object(c, c.env.BUCKET, image.r2Key, {
    contentType: image.contentType,
    cacheControl: 'private, max-age=31536000, immutable',
  })
})
