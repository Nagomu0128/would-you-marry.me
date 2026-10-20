import { env } from 'cloudflare:workers'
import { insertPhotoWithLimit, likePhoto, newId, photoKeys } from '@wym/db'
import type {
  GuestPhotoListResponse,
  GuestRankingResponse,
  LikeResponse,
  UploadPhotoResponse,
} from '@wym/shared'
import { describe, expect, it, vi } from 'vitest'
import { buildJpeg, buildPng, containsText, SECRETS } from '../src/worker/lib/image-fixtures'
import { db, errorCode, makeGuestSession, makeTenant, request } from './helpers'

// ------------------------------------------------------------ 道具

const SECRET_TEXTS = Object.values(SECRETS)

function file(bytes: Uint8Array, type = 'image/jpeg', name = 'photo.jpg'): File {
  return new File([bytes], name, { type })
}

type UploadParts = {
  original?: File | null
  display?: File | null
  thumb?: File | null
  width?: string | null
  height?: string | null
}

function uploadForm(parts: UploadParts = {}): FormData {
  const form = new FormData()
  const original = parts.original === undefined ? file(buildJpeg().bytes) : parts.original
  const display = parts.display === undefined ? file(buildJpeg().bytes) : parts.display
  const thumb = parts.thumb === undefined ? file(buildJpeg().bytes) : parts.thumb
  if (original) form.set('original', original)
  if (display) form.set('display', display)
  if (thumb) form.set('thumb', thumb)
  const width = parts.width === undefined ? '1600' : parts.width
  const height = parts.height === undefined ? '1200' : parts.height
  if (width !== null) form.set('width', width)
  if (height !== null) form.set('height', height)
  return form
}

const upload = (tenantId: string, cookie: string, parts?: UploadParts) =>
  request(`/api/t/${tenantId}/photos`, { method: 'POST', cookie, body: uploadForm(parts) })

async function r2Bytes(key: string): Promise<Uint8Array | null> {
  const object = await env.BUCKET.get(key)
  return object ? new Uint8Array(await object.arrayBuffer()) : null
}

async function r2KeysOf(tenantId: string): Promise<string[]> {
  const listed = await env.BUCKET.list({ prefix: `tenants/${tenantId}/` })
  return listed.objects.map((o) => o.key)
}

/** 写真を D1 に直接登録する（R2 にも小さな画像を置く） */
async function seedPhoto(
  tenantId: string,
  guestId: string,
  options: { createdAt?: number; png?: boolean; withFiles?: boolean } = {},
) {
  const id = newId()
  const contentType = options.png ? 'image/png' : 'image/jpeg'
  const keys = photoKeys(tenantId, id, contentType)
  if (options.withFiles !== false) {
    await env.BUCKET.put(keys.original, options.png ? buildPng().bytes : buildJpeg().bytes, {
      httpMetadata: { contentType },
    })
    await env.BUCKET.put(keys.display, new Uint8Array([0xff, 0xd8, 0xff, 1]), {
      httpMetadata: { contentType: 'image/jpeg' },
    })
    await env.BUCKET.put(keys.thumb, new Uint8Array([0xff, 0xd8, 0xff, 2]), {
      httpMetadata: { contentType: 'image/jpeg' },
    })
  }
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
    options.createdAt ?? Date.now(),
  )
  if (!result.inserted) throw new Error('seed failed')
  return { id, keys, photo: result.photo }
}

async function photoRowCount(tenantId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM photos WHERE tenant_id = ?')
    .bind(tenantId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

async function setup(nickname = 'たろう') {
  const tenant = await makeTenant()
  const session = await makeGuestSession(tenant.id, nickname)
  return { tenant, ...session }
}

// ------------------------------------------------------------ アップロード

describe('POST /photos', () => {
  it('成功: R2 に 3 つ、D1 に 1 行。メタデータが除かれ、向きは残る', async () => {
    const { tenant, cookie, guest } = await setup()
    const source = buildJpeg({ orientation: 6 }).bytes
    expect(containsText(source, SECRETS.make)).toBe(true)

    const res = await upload(tenant.id, cookie, {
      original: file(source),
      display: file(buildJpeg().bytes),
      thumb: file(buildJpeg().bytes),
      width: '1600',
      height: '1200',
    })
    expect(res.status).toBe(201)
    const { photo } = await res.json<UploadPhotoResponse>()
    expect(photo).toEqual({
      id: photo.id,
      uploader: { nickname: 'たろう' },
      likeCount: 0,
      likedByMe: false,
      isMine: true,
      width: 1600,
      height: 1200,
      createdAt: photo.createdAt,
      urls: {
        thumb: `/api/t/${tenant.id}/photos/${photo.id}/thumb`,
        display: `/api/t/${tenant.id}/photos/${photo.id}/display`,
        original: `/api/t/${tenant.id}/photos/${photo.id}/original`,
      },
    })
    expect(new Date(photo.createdAt).toISOString()).toBe(photo.createdAt)

    const keys = photoKeys(tenant.id, photo.id, 'image/jpeg')
    expect(await r2KeysOf(tenant.id)).toEqual([keys.display, keys.original, keys.thumb].sort())
    for (const key of [keys.original, keys.display, keys.thumb]) {
      const bytes = await r2Bytes(key)
      expect(bytes).not.toBeNull()
      if (!bytes) continue
      for (const secret of SECRET_TEXTS) expect(containsText(bytes, secret)).toBe(false)
      expect((await env.BUCKET.head(key))?.httpMetadata?.contentType).toBe('image/jpeg')
    }
    // 向き（Orientation）を持つ EXIF が original に残っている
    const original = await r2Bytes(keys.original)
    expect(original && containsText(original, 'Exif')).toBe(true)

    const row = await env.DB.prepare('SELECT * FROM photos WHERE id = ?').bind(photo.id).first<{
      tenant_id: string
      guest_id: string
      stored_size_bytes: number
      original_content_type: string
    }>()
    expect(row?.tenant_id).toBe(tenant.id)
    expect(row?.guest_id).toBe(guest.id)
    expect(row?.original_content_type).toBe('image/jpeg')
    const sizes = await Promise.all(
      [keys.original, keys.display, keys.thumb].map(async (k) => (await r2Bytes(k))?.byteLength),
    )
    expect(row?.stored_size_bytes).toBe(sizes.reduce<number>((a, b) => a + (b ?? 0), 0))
    expect(await photoRowCount(tenant.id)).toBe(1)
  })

  it('PNG のオリジナル: テキスト系チャンクが除かれ、拡張子は png', async () => {
    const { tenant, cookie } = await setup()
    const res = await upload(tenant.id, cookie, {
      original: file(buildPng().bytes, 'image/png', 'a.png'),
    })
    expect(res.status).toBe(201)
    const { photo } = await res.json<UploadPhotoResponse>()
    const keys = photoKeys(tenant.id, photo.id, 'image/png')
    expect(keys.original.endsWith('original.png')).toBe(true)
    const stored = await r2Bytes(keys.original)
    expect(stored).not.toBeNull()
    if (stored) {
      expect(containsText(stored, 'SECRETTEXT')).toBe(false)
      expect(containsText(stored, 'SECRETTRAILING')).toBe(false)
    }
    expect((await env.BUCKET.head(keys.original))?.httpMetadata?.contentType).toBe('image/png')
  })

  it('HEIC は UNSUPPORTED_FILE_TYPE（415）で、何も保存されない', async () => {
    const { tenant, cookie } = await setup()
    const heic = new Uint8Array(32)
    heic.set([0, 0, 0, 24], 0)
    heic.set(new TextEncoder().encode('ftypheic'), 4)
    const res = await upload(tenant.id, cookie, { original: file(heic, 'image/heic', 'a.heic') })
    expect(res.status).toBe(415)
    expect(await errorCode(res)).toBe('UNSUPPORTED_FILE_TYPE')
    expect(await r2KeysOf(tenant.id)).toEqual([])
    expect(await photoRowCount(tenant.id)).toBe(0)
  })

  it('テキストファイルは Content-Type が image/jpeg でも 415', async () => {
    const { tenant, cookie } = await setup()
    const text = new TextEncoder().encode('hello, this is not an image')
    const res = await upload(tenant.id, cookie, { original: file(text, 'image/jpeg') })
    expect(res.status).toBe(415)
    expect(await errorCode(res)).toBe('UNSUPPORTED_FILE_TYPE')
  })

  it('display・thumb が PNG だと 415', async () => {
    const { tenant, cookie } = await setup()
    const png = file(buildPng().bytes, 'image/png')
    for (const parts of [{ display: png }, { thumb: png }]) {
      const res = await upload(tenant.id, cookie, parts)
      expect(res.status).toBe(415)
      expect(await errorCode(res)).toBe('UNSUPPORTED_FILE_TYPE')
    }
    expect(await r2KeysOf(tenant.id)).toEqual([])
  })

  it('壊れた JPEG（SOS がない）は 415', async () => {
    const { tenant, cookie } = await setup()
    const broken = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0)
    const res = await upload(tenant.id, cookie, { thumb: file(broken) })
    expect(res.status).toBe(415)
  })

  it('サイズ超過は FILE_TOO_LARGE（413）。上限ちょうどは通る', async () => {
    const { tenant, cookie } = await setup()
    const big = (size: number) => file(buildJpeg({ entropyLength: size }).bytes)
    const MB = 1024 * 1024
    const cases: { parts: UploadParts }[] = [
      { parts: { original: big(10 * MB + 1024) } },
      { parts: { display: big(2 * MB + 1024) } },
      { parts: { thumb: big(512 * 1024 + 1024) } },
    ]
    for (const { parts } of cases) {
      const res = await upload(tenant.id, cookie, parts)
      expect(res.status).toBe(413)
      expect(await errorCode(res)).toBe('FILE_TOO_LARGE')
    }
    expect(await r2KeysOf(tenant.id)).toEqual([])
    expect(await photoRowCount(tenant.id)).toBe(0)
  })

  it('本文が大きすぎるときは、解析する前に FILE_TOO_LARGE', async () => {
    const { tenant, cookie } = await setup()
    const res = await request(`/api/t/${tenant.id}/photos`, {
      method: 'POST',
      cookie,
      headers: {
        'Content-Length': String(100 * 1024 * 1024),
        'Content-Type': 'multipart/form-data',
      },
      body: 'x',
    })
    expect(res.status).toBe(413)
    expect(await errorCode(res)).toBe('FILE_TOO_LARGE')
  })

  it('項目の不備は VALIDATION_ERROR と fields', async () => {
    const { tenant, cookie } = await setup()
    const res = await upload(tenant.id, cookie, {
      original: null,
      width: '0',
      height: 'abc',
    })
    expect(res.status).toBe(400)
    const body = await res.json<{ error: { code: string; fields: Record<string, string> } }>()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.fields).toEqual({ original: 'REQUIRED', width: 'INVALID', height: 'INVALID' })

    for (const width of ['-1', '1.5', '', '99999999999999999999']) {
      const r = await upload(tenant.id, cookie, { width })
      expect(r.status).toBe(400)
    }
    const missing = await upload(tenant.id, cookie, { width: null })
    expect(missing.status).toBe(400)
    // multipart ではない本文
    const notForm = await request(`/api/t/${tenant.id}/photos`, {
      method: 'POST',
      cookie,
      json: { a: 1 },
    })
    expect(notForm.status).toBe(400)
    expect(await errorCode(notForm)).toBe('VALIDATION_ERROR')
  })

  it('100 枚に達したら 409 UPLOAD_LIMIT_REACHED で、R2 に残骸が残らない', async () => {
    const { tenant, cookie, guest } = await setup()
    for (let i = 0; i < 100; i++) {
      await seedPhoto(tenant.id, guest.id, { createdAt: 1000 + i, withFiles: false })
    }
    const res = await upload(tenant.id, cookie)
    expect(res.status).toBe(409)
    expect(await errorCode(res)).toBe('UPLOAD_LIMIT_REACHED')
    expect(await r2KeysOf(tenant.id)).toEqual([])
    expect(await photoRowCount(tenant.id)).toBe(100)

    // 他の参加者は投稿できる
    const other = await makeGuestSession(tenant.id, 'はなこ')
    expect((await upload(tenant.id, other.cookie)).status).toBe(201)
  })

  it('99 枚なら 100 枚目を投稿できる', async () => {
    const { tenant, cookie, guest } = await setup()
    for (let i = 0; i < 99; i++) {
      await seedPhoto(tenant.id, guest.id, { createdAt: 1000 + i, withFiles: false })
    }
    expect((await upload(tenant.id, cookie)).status).toBe(201)
    expect((await upload(tenant.id, cookie)).status).toBe(409)
  })

  it('CSRF: Origin がないと FORBIDDEN', async () => {
    const { tenant, cookie } = await setup()
    const res = await request(`/api/t/${tenant.id}/photos`, {
      method: 'POST',
      cookie,
      origin: null,
      body: uploadForm(),
    })
    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('FORBIDDEN')
    expect(await photoRowCount(tenant.id)).toBe(0)
  })

  it('ニックネーム未登録だと NICKNAME_REQUIRED、セッションなしだと UNAUTHENTICATED', async () => {
    const tenant = await makeTenant()
    const { cookie } = await makeGuestSession(tenant.id)
    const res = await upload(tenant.id, cookie)
    expect(await errorCode(res)).toBe('NICKNAME_REQUIRED')
    const anon = await request(`/api/t/${tenant.id}/photos`, { method: 'POST', body: uploadForm() })
    expect(await errorCode(anon)).toBe('UNAUTHENTICATED')
  })

  it('数 MB の JPEG のアップロードの処理時間（目安）', async () => {
    const { tenant, cookie } = await setup()
    const original = file(buildJpeg({ entropyLength: 6 * 1024 * 1024 }).bytes)
    const display = file(buildJpeg({ entropyLength: 1500 * 1024 }).bytes)
    const thumb = file(buildJpeg({ entropyLength: 300 * 1024 }).bytes)
    const started = performance.now()
    const res = await upload(tenant.id, cookie, { original, display, thumb })
    const elapsed = performance.now() - started
    expect(res.status).toBe(201)
    // 目安（ローカルの workerd）。極端に遅くなっていないことだけを確かめる
    expect(elapsed).toBeLessThan(5000)
  })
})

// ------------------------------------------------------------ 一覧

describe('GET /photos', () => {
  const list = (tenantId: string, cookie: string, query = '') =>
    request(`/api/t/${tenantId}/photos${query}`, { cookie })

  it('新しい順に返し、カーソルで全件を取得できる', async () => {
    const { tenant, cookie, guest } = await setup()
    const ids: string[] = []
    for (let i = 0; i < 7; i++) {
      const seeded = await seedPhoto(tenant.id, guest.id, { createdAt: 1000 + i, withFiles: false })
      ids.push(seeded.id)
    }
    // created_at が同じ写真があっても重複・欠落しない
    const same1 = await seedPhoto(tenant.id, guest.id, { createdAt: 1003, withFiles: false })
    const expected = [...ids, same1.id]
      .map((id, index) => ({ id, createdAt: index < 7 ? 1000 + index : 1003 }))
      .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1))
      .map((p) => p.id)

    const seen: string[] = []
    let cursor: string | null = null
    for (let page = 0; page < 10; page++) {
      const query: string = `?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      const res = await list(tenant.id, cookie, query)
      expect(res.status).toBe(200)
      const body: GuestPhotoListResponse = await res.json()
      expect(body.photos.length).toBeLessThanOrEqual(3)
      seen.push(...body.photos.map((p) => p.id))
      cursor = body.nextCursor
      if (!cursor) break
    }
    expect(seen).toEqual(expected)
  })

  it('既定は 30 件、limit は 50 まで', async () => {
    const { tenant, cookie, guest } = await setup()
    for (let i = 0; i < 55; i++) {
      await seedPhoto(tenant.id, guest.id, { createdAt: 1000 + i, withFiles: false })
    }
    const def: GuestPhotoListResponse = await (await list(tenant.id, cookie)).json()
    expect(def.photos).toHaveLength(30)
    expect(def.nextCursor).not.toBeNull()
    const max: GuestPhotoListResponse = await (await list(tenant.id, cookie, '?limit=50')).json()
    expect(max.photos).toHaveLength(50)
  })

  it('limit の不正値は VALIDATION_ERROR', async () => {
    const { tenant, cookie } = await setup()
    for (const limit of ['0', '51', '-1', 'abc', '1.5', '']) {
      const res = await list(tenant.id, cookie, `?limit=${limit}`)
      expect(res.status).toBe(400)
      expect(await errorCode(res)).toBe('VALIDATION_ERROR')
    }
  })

  it('不正なカーソルは VALIDATION_ERROR', async () => {
    const { tenant, cookie } = await setup()
    for (const cursor of ['garbage', '_abc', 'abc_def', '12_', '-5_x']) {
      const res = await list(tenant.id, cookie, `?cursor=${encodeURIComponent(cursor)}`)
      expect(res.status).toBe(400)
      expect(await errorCode(res)).toBe('VALIDATION_ERROR')
    }
  })

  it('mine=1 は自分の投稿だけ。likedByMe・isMine が付き、uploader.id は返さない', async () => {
    const { tenant, cookie, guest } = await setup()
    const other = await makeGuestSession(tenant.id, 'はなこ')
    const mine = await seedPhoto(tenant.id, guest.id, { createdAt: 1000, withFiles: false })
    const theirs = await seedPhoto(tenant.id, other.guest.id, { createdAt: 2000, withFiles: false })
    await likePhoto(db, tenant.id, guest.id, theirs.id)

    const all: GuestPhotoListResponse = await (await list(tenant.id, cookie)).json()
    expect(all.photos.map((p) => p.id)).toEqual([theirs.id, mine.id])
    const [first, second] = all.photos
    expect(first).toMatchObject({ isMine: false, likedByMe: true, likeCount: 1 })
    expect(first?.uploader).toEqual({ nickname: 'はなこ' })
    expect(second).toMatchObject({ isMine: true, likedByMe: false, likeCount: 0 })
    expect(JSON.stringify(all)).not.toContain(other.guest.id)
    expect(JSON.stringify(all)).not.toContain('"uploader":{"id"')

    const onlyMine: GuestPhotoListResponse = await (await list(tenant.id, cookie, '?mine=1')).json()
    expect(onlyMine.photos.map((p) => p.id)).toEqual([mine.id])
    expect(onlyMine.nextCursor).toBeNull()
  })

  it('テナント A のタイムラインにテナント B の写真は含まれない', async () => {
    const a = await setup()
    const b = await setup('じろう')
    await seedPhoto(a.tenant.id, a.guest.id, { withFiles: false })
    const inB = await seedPhoto(b.tenant.id, b.guest.id, { withFiles: false })
    const body: GuestPhotoListResponse = await (await list(a.tenant.id, a.cookie)).json()
    expect(body.photos).toHaveLength(1)
    expect(body.photos.map((p) => p.id)).not.toContain(inB.id)
  })

  it('A のセッションで B の /photos を呼ぶと UNAUTHENTICATED', async () => {
    const a = await setup()
    const b = await setup('じろう')
    const res = await list(b.tenant.id, a.cookie)
    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('UNAUTHENTICATED')
  })
})

// ------------------------------------------------------------ ランキング

describe('GET /photos/ranking', () => {
  const ranking = async (tenantId: string, cookie: string) => {
    const res = await request(`/api/t/${tenantId}/photos/ranking`, { cookie })
    expect(res.status).toBe(200)
    return res.json<GuestRankingResponse>()
  }

  it('いいね 0 件は載らず、同数は古い順、rank は連番', async () => {
    const { tenant, cookie, guest } = await setup()
    const fans = await Promise.all(
      ['a', 'b', 'c'].map((n) => makeGuestSession(tenant.id, `ファン${n}`)),
    )
    const none = await seedPhoto(tenant.id, guest.id, { createdAt: 1000, withFiles: false })
    const old = await seedPhoto(tenant.id, guest.id, { createdAt: 2000, withFiles: false })
    const newer = await seedPhoto(tenant.id, guest.id, { createdAt: 3000, withFiles: false })
    const top = await seedPhoto(tenant.id, guest.id, { createdAt: 4000, withFiles: false })
    // top: 3 件、old と newer: 1 件ずつ
    for (const fan of fans) await likePhoto(db, tenant.id, fan.guest.id, top.id)
    await likePhoto(db, tenant.id, fans[0]?.guest.id ?? '', old.id)
    await likePhoto(db, tenant.id, fans[0]?.guest.id ?? '', newer.id)

    const body = await ranking(tenant.id, cookie)
    expect(body.photos.map((p) => p.id)).toEqual([top.id, old.id, newer.id])
    expect(body.photos.map((p) => p.rank)).toEqual([1, 2, 3])
    expect(body.photos.map((p) => p.id)).not.toContain(none.id)
    expect(body.photos[0]).toMatchObject({ likeCount: 3, isMine: true, likedByMe: false })
  })

  it('最大 10 件', async () => {
    const { tenant, cookie, guest } = await setup()
    for (let i = 0; i < 12; i++) {
      const seeded = await seedPhoto(tenant.id, guest.id, { createdAt: 1000 + i, withFiles: false })
      await likePhoto(db, tenant.id, guest.id, seeded.id)
    }
    const body = await ranking(tenant.id, cookie)
    expect(body.photos).toHaveLength(10)
    expect(body.photos.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('テナント A のランキングにテナント B の写真は含まれない', async () => {
    const a = await setup()
    const b = await setup('じろう')
    const inB = await seedPhoto(b.tenant.id, b.guest.id, { withFiles: false })
    await likePhoto(db, b.tenant.id, b.guest.id, inB.id)
    const body = await ranking(a.tenant.id, a.cookie)
    expect(body.photos).toEqual([])
  })
})

// ------------------------------------------------------------ 削除

describe('DELETE /photos/:photoId', () => {
  const del = (tenantId: string, cookie: string, photoId: string) =>
    request(`/api/t/${tenantId}/photos/${photoId}`, { method: 'DELETE', cookie })

  it('自分の写真は 204 で消え、R2 の 3 つも消える。いいねも消えランキングから外れる', async () => {
    const { tenant, cookie, guest } = await setup()
    const fan = await makeGuestSession(tenant.id, 'ファン')
    const seeded = await seedPhoto(tenant.id, guest.id)
    await likePhoto(db, tenant.id, fan.guest.id, seeded.id)
    expect(await r2KeysOf(tenant.id)).toHaveLength(3)

    const res = await del(tenant.id, cookie, seeded.id)
    expect(res.status).toBe(204)
    expect(await photoRowCount(tenant.id)).toBe(0)
    const likes = await env.DB.prepare('SELECT COUNT(*) AS n FROM likes WHERE photo_id = ?')
      .bind(seeded.id)
      .first<{ n: number }>()
    expect(likes?.n).toBe(0)
    await vi.waitFor(async () => expect(await r2KeysOf(tenant.id)).toEqual([]))

    const ranking: GuestRankingResponse = await (
      await request(`/api/t/${tenant.id}/photos/ranking`, { cookie })
    ).json()
    expect(ranking.photos).toEqual([])
    // 二度目は NOT_FOUND
    expect(await errorCode(await del(tenant.id, cookie, seeded.id))).toBe('NOT_FOUND')
  })

  it('同じテナントの他人の写真は FORBIDDEN で、消えない', async () => {
    const { tenant, cookie } = await setup()
    const other = await makeGuestSession(tenant.id, 'はなこ')
    const seeded = await seedPhoto(tenant.id, other.guest.id)
    const res = await del(tenant.id, cookie, seeded.id)
    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('FORBIDDEN')
    expect(await photoRowCount(tenant.id)).toBe(1)
    expect(await r2KeysOf(tenant.id)).toHaveLength(3)
  })

  it('ない写真は NOT_FOUND', async () => {
    const { tenant, cookie } = await setup()
    for (const id of [newId(), 'not-a-uuid']) {
      const res = await del(tenant.id, cookie, id)
      expect(res.status).toBe(404)
      expect(await errorCode(res)).toBe('NOT_FOUND')
    }
  })

  it('CSRF: Origin がないと FORBIDDEN で、消えない', async () => {
    const { tenant, cookie, guest } = await setup()
    const seeded = await seedPhoto(tenant.id, guest.id)
    const res = await request(`/api/t/${tenant.id}/photos/${seeded.id}`, {
      method: 'DELETE',
      cookie,
      origin: null,
    })
    expect(res.status).toBe(403)
    expect(await photoRowCount(tenant.id)).toBe(1)
  })
})

// ------------------------------------------------------------ いいね

describe('PUT / DELETE /photos/:photoId/like', () => {
  const like = (tenantId: string, cookie: string, photoId: string, method = 'PUT') =>
    request(`/api/t/${tenantId}/photos/${photoId}/like`, { method, cookie })

  it('冪等で、取り消せる。自分の写真にも付けられる', async () => {
    const { tenant, cookie, guest } = await setup()
    const other = await makeGuestSession(tenant.id, 'はなこ')
    const mine = await seedPhoto(tenant.id, guest.id, { withFiles: false })

    for (let i = 0; i < 3; i++) {
      const res = await like(tenant.id, cookie, mine.id)
      expect(res.status).toBe(200)
      expect(await res.json<LikeResponse>()).toEqual({ likeCount: 1, likedByMe: true })
    }
    expect(await (await like(tenant.id, other.cookie, mine.id)).json<LikeResponse>()).toEqual({
      likeCount: 2,
      likedByMe: true,
    })
    for (let i = 0; i < 2; i++) {
      const res = await like(tenant.id, cookie, mine.id, 'DELETE')
      expect(res.status).toBe(200)
      expect(await res.json<LikeResponse>()).toEqual({ likeCount: 1, likedByMe: false })
    }
  })

  it('ない写真は NOT_FOUND', async () => {
    const { tenant, cookie } = await setup()
    for (const method of ['PUT', 'DELETE']) {
      const res = await like(tenant.id, cookie, newId(), method)
      expect(res.status).toBe(404)
      expect(await errorCode(res)).toBe('NOT_FOUND')
    }
  })
})

// ------------------------------------------------------------ 画像

describe('GET /photos/:photoId/(thumb|display|original)', () => {
  const get = (tenantId: string, cookie: string, path: string) =>
    request(`/api/t/${tenantId}/photos/${path}`, { cookie })

  it('キャッシュのヘッダーと Content-Type', async () => {
    const { tenant, cookie, guest } = await setup()
    const seeded = await seedPhoto(tenant.id, guest.id)
    for (const variant of ['thumb', 'display', 'original']) {
      const res = await get(tenant.id, cookie, `${seeded.id}/${variant}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable')
      expect(res.headers.get('Content-Type')).toBe('image/jpeg')
      expect(res.headers.get('Content-Disposition')).toBeNull()
      await res.arrayBuffer()
    }
  })

  it('アップロードした画像をそのまま取得できる', async () => {
    const { tenant, cookie } = await setup()
    const res = await upload(tenant.id, cookie)
    const { photo } = await res.json<UploadPhotoResponse>()
    const image = await get(tenant.id, cookie, `${photo.id}/thumb`)
    const stored = await r2Bytes(photoKeys(tenant.id, photo.id, 'image/jpeg').thumb)
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(stored)
  })

  it('download=1 は attachment。拡張子は実際の形式に合わせる', async () => {
    const { tenant, cookie, guest } = await setup()
    const jpeg = await seedPhoto(tenant.id, guest.id)
    const png = await seedPhoto(tenant.id, guest.id, { png: true })

    const jpegRes = await get(tenant.id, cookie, `${jpeg.id}/original?download=1`)
    expect(jpegRes.headers.get('Content-Disposition')).toBe(
      `attachment; filename="wedding-photo-${jpeg.id}.jpg"`,
    )
    await jpegRes.arrayBuffer()
    const pngRes = await get(tenant.id, cookie, `${png.id}/original?download=1`)
    expect(pngRes.headers.get('Content-Type')).toBe('image/png')
    expect(pngRes.headers.get('Content-Disposition')).toBe(
      `attachment; filename="wedding-photo-${png.id}.png"`,
    )
    await pngRes.arrayBuffer()
    // download=1 がなければ付かない
    const plain = await get(tenant.id, cookie, `${png.id}/original`)
    expect(plain.headers.get('Content-Disposition')).toBeNull()
    await plain.arrayBuffer()
  })

  it('ない写真・不明な種類は NOT_FOUND', async () => {
    const { tenant, cookie, guest } = await setup()
    const seeded = await seedPhoto(tenant.id, guest.id)
    expect((await get(tenant.id, cookie, `${newId()}/thumb`)).status).toBe(404)
    expect((await get(tenant.id, cookie, `${seeded.id}/huge`)).status).toBe(404)
  })
})

// ------------------------------------------------------------ テナント分離

describe('テナント分離（multi-tenancy.md の確認観点）', () => {
  it('A の参加者は B の写真を、画像 3 種・いいね・削除のどれでも操作できない', async () => {
    const a = await setup('あ')
    const b = await setup('い')
    const inB = await seedPhoto(b.tenant.id, b.guest.id)

    for (const variant of ['thumb', 'display', 'original']) {
      const res = await request(`/api/t/${a.tenant.id}/photos/${inB.id}/${variant}`, {
        cookie: a.cookie,
      })
      expect(res.status).toBe(404)
      expect(await errorCode(res)).toBe('NOT_FOUND')
    }
    for (const method of ['PUT', 'DELETE']) {
      const res = await request(`/api/t/${a.tenant.id}/photos/${inB.id}/like`, {
        method,
        cookie: a.cookie,
      })
      expect(res.status).toBe(404)
      expect(await errorCode(res)).toBe('NOT_FOUND')
    }
    const del = await request(`/api/t/${a.tenant.id}/photos/${inB.id}`, {
      method: 'DELETE',
      cookie: a.cookie,
    })
    expect(del.status).toBe(404)
    expect(await errorCode(del)).toBe('NOT_FOUND')

    // B の写真は無傷（行・いいね数・R2）
    const row = await env.DB.prepare('SELECT like_count FROM photos WHERE id = ?')
      .bind(inB.id)
      .first<{ like_count: number }>()
    expect(row?.like_count).toBe(0)
    const likes = await env.DB.prepare('SELECT COUNT(*) AS n FROM likes WHERE photo_id = ?')
      .bind(inB.id)
      .first<{ n: number }>()
    expect(likes?.n).toBe(0)
    expect(await r2KeysOf(b.tenant.id)).toHaveLength(3)
    // B の所有者本人は引き続き見られる
    const own = await request(`/api/t/${b.tenant.id}/photos/${inB.id}/thumb`, { cookie: b.cookie })
    expect(own.status).toBe(200)
    await own.arrayBuffer()
  })

  it('A のセッションで B の画像・アップロードを呼ぶと UNAUTHENTICATED', async () => {
    const a = await setup('あ')
    const b = await setup('い')
    const inB = await seedPhoto(b.tenant.id, b.guest.id)
    const image = await request(`/api/t/${b.tenant.id}/photos/${inB.id}/thumb`, {
      cookie: a.cookie,
    })
    expect(await errorCode(image)).toBe('UNAUTHENTICATED')
    const posted = await upload(b.tenant.id, a.cookie)
    expect(posted.status).toBe(401)
    expect(await errorCode(posted)).toBe('UNAUTHENTICATED')
    expect(await photoRowCount(b.tenant.id)).toBe(1)
  })

  it('アップロード済みの写真は自分のテナントの下にだけ保存される', async () => {
    const a = await setup('あ')
    const b = await setup('い')
    const res = await upload(a.tenant.id, a.cookie)
    expect(res.status).toBe(201)
    expect(await r2KeysOf(a.tenant.id)).toHaveLength(3)
    expect(await r2KeysOf(b.tenant.id)).toEqual([])
  })
})
