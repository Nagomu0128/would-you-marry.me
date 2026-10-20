import { env } from 'cloudflare:workers'
import {
  createGuest,
  createTenant,
  insertPhotoWithLimit,
  likePhoto,
  photoKeys,
  setGuestNickname,
} from '@wym/db'
import { app } from '../src/worker/app'
import { ADMIN_EMAIL, createSession, db, ORIGIN, type TestSession, testEnv } from './helpers'

/** JSON 以外の本文（PDF・multipart など）を管理者のセッションで送る */
export async function adminRawRequest(
  path: string,
  init: { method: string; body?: BodyInit; headers?: Record<string, string> },
  session?: TestSession,
): Promise<Response> {
  const s = session ?? (await createSession())
  const headers = new Headers(init.headers)
  headers.set('Cookie', s.cookie)
  if (init.method !== 'GET' && init.method !== 'HEAD') headers.set('Origin', ORIGIN)
  return app.request(`${ORIGIN}${path}`, { ...init, headers }, testEnv())
}

/** 先頭のバイト列だけが本物の、テスト用ファイル */
export function fakePdf(size = 64): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size)
  bytes.set(new TextEncoder().encode('%PDF-1.4\n'))
  return bytes
}

export function fakeJpeg(size = 64): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size)
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  return bytes
}

export function fakePng(size = 64): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return bytes
}

export function imageForm(bytes: Uint8Array<ArrayBuffer>, name = 'menu.jpg'): FormData {
  const form = new FormData()
  form.set('file', new File([bytes], name))
  return form
}

/** 監査ログの行（古い順） */
export async function auditRows(tenantId: string) {
  const { results } = await env.DB.prepare(
    'SELECT actor, action, target_id AS targetId, detail FROM audit_logs WHERE tenant_id = ? ORDER BY created_at, rowid',
  )
    .bind(tenantId)
    .all<{ actor: string; action: string; targetId: string | null; detail: string | null }>()
  return results
}

export async function newTenant(eventDate = '2026-10-31') {
  return createTenant(db, { name: 'テスト', eventDate, createdBy: ADMIN_EMAIL })
}

export async function newGuest(tenantId: string, nickname: string | null) {
  const guest = await createGuest(db, tenantId)
  if (nickname !== null) {
    await setGuestNickname(db, tenantId, guest.id, { nickname, nicknameKey: nickname })
  }
  return guest
}

/** 写真の行と、R2 の 3 つのファイルを作る */
export async function newPhoto(
  tenantId: string,
  guestId: string,
  options: { id?: string; contentType?: 'image/jpeg' | 'image/png'; createdAt?: number } = {},
) {
  const id = options.id ?? crypto.randomUUID()
  const contentType = options.contentType ?? 'image/jpeg'
  const keys = photoKeys(tenantId, id, contentType)
  await env.BUCKET.put(keys.original, fakeJpeg(30), { httpMetadata: { contentType } })
  await env.BUCKET.put(keys.display, fakeJpeg(20), { httpMetadata: { contentType: 'image/jpeg' } })
  await env.BUCKET.put(keys.thumb, fakeJpeg(10), { httpMetadata: { contentType: 'image/jpeg' } })
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
      storedSizeBytes: 60,
      width: 1600,
      height: 1200,
    },
    100,
    options.createdAt,
  )
  if (!result.inserted) throw new Error('failed to insert photo')
  return { id, keys }
}

export { likePhoto }
