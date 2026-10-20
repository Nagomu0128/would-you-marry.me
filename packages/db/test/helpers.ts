import { env } from 'cloudflare:workers'
import {
  createDb,
  createGuest,
  createTenant,
  insertPhotoWithLimit,
  newId,
  setGuestNickname,
} from '../src'

export const db = createDb(env.DB)

export const NO_LIMIT = 1_000_000

export async function makeTenant(eventDate = '2026-10-31') {
  return createTenant(db, {
    name: `結婚式 ${newId().slice(0, 8)}`,
    eventDate,
    createdBy: 'a@example.com',
  })
}

/** ニックネーム付きの参加者を作る */
export async function makeGuest(tenantId: string, nickname?: string) {
  const guest = await createGuest(db, tenantId)
  if (nickname === undefined) return guest
  const result = await setGuestNickname(db, tenantId, guest.id, {
    nickname,
    nicknameKey: nickname.trim(),
  })
  if (!result.ok) throw new Error(`nickname ${nickname} is taken`)
  return result.guest
}

/** 写真を登録する（上限なし） */
export async function makePhoto(
  tenantId: string,
  guestId: string,
  options: { createdAt?: number; id?: string; storedSizeBytes?: number } = {},
) {
  const id = options.id ?? newId()
  const result = await insertPhotoWithLimit(
    db,
    tenantId,
    {
      id,
      guestId,
      originalKey: `tenants/${tenantId}/photos/${id}/original.jpg`,
      displayKey: `tenants/${tenantId}/photos/${id}/display.jpg`,
      thumbKey: `tenants/${tenantId}/photos/${id}/thumb.jpg`,
      originalContentType: 'image/jpeg',
      storedSizeBytes: options.storedSizeBytes ?? 1000,
      width: 1600,
      height: 1200,
    },
    NO_LIMIT,
    options.createdAt,
  )
  if (!result.inserted) throw new Error('failed to insert photo')
  return result.photo
}

export async function count(table: string, where = '1 = 1'): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).first<{
    n: number
  }>()
  return row?.n ?? 0
}
