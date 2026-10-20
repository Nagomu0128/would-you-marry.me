// セキュリティのテスト用に、写真・席次表・コース表を R2 と D1 に直接入れる道具
import { env } from 'cloudflare:workers'
import {
  addCourseMenuImage,
  courseMenuImageKey,
  insertPhotoWithLimit,
  newId,
  photoKeys,
  seatingChartKey,
  upsertSeatingChart,
} from '@wym/db'
import { buildJpeg, buildPng } from '../src/worker/lib/image-fixtures'
import { db } from './helpers'

export async function seedPhoto(tenantId: string, guestId: string, png = false) {
  const id = newId()
  const contentType = png ? 'image/png' : 'image/jpeg'
  const keys = photoKeys(tenantId, id, contentType)
  await env.BUCKET.put(keys.original, png ? buildPng().bytes : buildJpeg().bytes, {
    httpMetadata: { contentType },
  })
  await env.BUCKET.put(keys.display, new Uint8Array([0xff, 0xd8, 0xff, 1]), {
    httpMetadata: { contentType: 'image/jpeg' },
  })
  await env.BUCKET.put(keys.thumb, new Uint8Array([0xff, 0xd8, 0xff, 2]), {
    httpMetadata: { contentType: 'image/jpeg' },
  })
  const result = await insertPhotoWithLimit(
    db,
    tenantId,
    {
      id,
      guestId,
      originalKey: keys.original,
      displayKey: keys.display,
      thumbKey: keys.thumb,
      originalContentType: contentType,
      storedSizeBytes: 100,
      width: 800,
      height: 600,
    },
    100,
  )
  if (!result.inserted) throw new Error('seed failed')
  return { id, keys, contentType }
}

export async function seedSeatingChart(tenantId: string) {
  const key = seatingChartKey(tenantId, newId())
  await env.BUCKET.put(key, '%PDF-1.4 seating', { httpMetadata: { contentType: 'application/pdf' } })
  await upsertSeatingChart(db, tenantId, { r2Key: key, sizeBytes: 16 })
  return { key }
}

export async function seedMenuImage(tenantId: string) {
  const id = newId()
  const key = courseMenuImageKey(tenantId, id, 'image/png')
  await env.BUCKET.put(key, buildPng().bytes, { httpMetadata: { contentType: 'image/png' } })
  await addCourseMenuImage(db, tenantId, {
    id,
    r2Key: key,
    contentType: 'image/png',
    sizeBytes: 10,
  })
  return { id, key }
}

/** テナントの状態を直接変える（期間・停止・削除済み） */
export async function setTenant(
  tenantId: string,
  change: { eventDate?: string; suspended?: boolean; deleted?: boolean },
) {
  if (change.eventDate !== undefined) {
    await env.DB.prepare('UPDATE tenants SET event_date = ? WHERE id = ?')
      .bind(change.eventDate, tenantId)
      .run()
  }
  if (change.suspended !== undefined) {
    await env.DB.prepare('UPDATE tenants SET suspended = ? WHERE id = ?')
      .bind(change.suspended ? 1 : 0, tenantId)
      .run()
  }
  if (change.deleted) {
    await env.DB.prepare('UPDATE tenants SET data_deleted_at = ? WHERE id = ?')
      .bind(Date.now(), tenantId)
      .run()
  }
}
