import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { auditRows, likePhoto, newGuest, newPhoto, newTenant } from './fixtures'
import { ADMIN_EMAIL, adminRequest, db, resetStorage } from './helpers'

beforeEach(resetStorage)

type ErrBody = { error: { code: string; fields?: Record<string, string> } }
type PhotoBody = {
  id: string
  uploader: { id: string; nickname: string }
  likeCount: number
  urls: { thumb: string; display: string; original: string }
}

async function listPhotos(tenantId: string, query = '') {
  const res = await adminRequest(`/api/tenants/${tenantId}/photos${query}`)
  return { res, body: (await res.json()) as { photos: PhotoBody[]; nextCursor: string | null } }
}

describe('写真の一覧', () => {
  it('新しい順に、uploader.id つきで返し、カーソルで続きを取れる', async () => {
    const t = await newTenant()
    const guest = await newGuest(t.id, 'taro')
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      ids.push((await newPhoto(t.id, guest.id, { createdAt: 1_000 + i })).id)
    }
    const page1 = await listPhotos(t.id, '?limit=2')
    expect(page1.res.status).toBe(200)
    expect(page1.body.photos.map((p) => p.id)).toEqual([ids[2], ids[1]])
    expect(page1.body.nextCursor).toBeTruthy()
    const first = page1.body.photos[0]
    expect(first?.uploader).toEqual({ id: guest.id, nickname: 'taro' })
    expect(first?.urls).toEqual({
      thumb: `/api/tenants/${t.id}/photos/${ids[2]}/thumb`,
      display: `/api/tenants/${t.id}/photos/${ids[2]}/display`,
      original: `/api/tenants/${t.id}/photos/${ids[2]}/original`,
    })
    expect(first).not.toHaveProperty('likedByMe')
    expect(first).not.toHaveProperty('isMine')

    const page2 = await listPhotos(t.id, `?limit=2&cursor=${page1.body.nextCursor}`)
    expect(page2.body.photos.map((p) => p.id)).toEqual([ids[0]])
    expect(page2.body.nextCursor).toBeNull()
  })

  it('不正な cursor・limit は 400。limit は 50 を超えても丸める', async () => {
    const t = await newTenant()
    for (const q of ['?cursor=zzz', '?limit=0', '?limit=abc']) {
      const { res, body } = await listPhotos(t.id, q)
      expect(res.status).toBe(400)
      expect((body as unknown as ErrBody).error.code).toBe('VALIDATION_ERROR')
    }
    expect((await listPhotos(t.id, '?limit=999')).res.status).toBe(200)
  })
})

describe('写真の削除', () => {
  it('D1・R2 から消え、いいねも消え、監査ログが残る。再度は 404', async () => {
    const t = await newTenant()
    const guest = await newGuest(t.id, 'taro')
    const other = await newGuest(t.id, 'hanako')
    const photo = await newPhoto(t.id, guest.id)
    await likePhoto(db, t.id, other.id, photo.id)
    expect((await env.BUCKET.list()).objects).toHaveLength(3)

    const res = await adminRequest(`/api/tenants/${t.id}/photos/${photo.id}`, {
      method: 'DELETE',
    })
    expect(res.status).toBe(204)
    expect((await env.BUCKET.list()).objects).toHaveLength(0)
    const photos = await env.DB.prepare('SELECT COUNT(*) AS n FROM photos').first<{ n: number }>()
    const likes = await env.DB.prepare('SELECT COUNT(*) AS n FROM likes').first<{ n: number }>()
    expect(photos?.n).toBe(0)
    expect(likes?.n).toBe(0)
    expect((await auditRows(t.id)).at(-1)).toMatchObject({
      actor: ADMIN_EMAIL,
      action: 'photo.delete',
      targetId: photo.id,
    })

    const again = await adminRequest(`/api/tenants/${t.id}/photos/${photo.id}`, {
      method: 'DELETE',
    })
    expect(again.status).toBe(404)
  })
})

describe('写真の画像', () => {
  it('3 種類を、参加者向けと同じキャッシュのヘッダーで返す', async () => {
    const t = await newTenant()
    const guest = await newGuest(t.id, 'taro')
    const photo = await newPhoto(t.id, guest.id)
    const base = `/api/tenants/${t.id}/photos/${photo.id}`
    for (const [kind, size] of [
      ['thumb', 10],
      ['display', 20],
      ['original', 30],
    ] as const) {
      const res = await adminRequest(`${base}/${kind}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/jpeg')
      expect(res.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable')
      expect(res.headers.get('Content-Disposition')).toBeNull()
      expect((await res.arrayBuffer()).byteLength).toBe(size)
    }
  })

  it('original?download=1 は attachment（拡張子は元の形式）', async () => {
    const t = await newTenant()
    const guest = await newGuest(t.id, 'taro')
    const jpg = await newPhoto(t.id, guest.id)
    const png = await newPhoto(t.id, guest.id, { contentType: 'image/png' })
    const a = await adminRequest(`/api/tenants/${t.id}/photos/${jpg.id}/original?download=1`)
    expect(a.headers.get('Content-Disposition')).toBe(
      `attachment; filename="wedding-photo-${jpg.id}.jpg"`,
    )
    const b = await adminRequest(`/api/tenants/${t.id}/photos/${png.id}/original?download=1`)
    expect(b.headers.get('Content-Type')).toBe('image/png')
    expect(b.headers.get('Content-Disposition')).toBe(
      `attachment; filename="wedding-photo-${png.id}.png"`,
    )
  })

  it('ない写真は 404', async () => {
    const t = await newTenant()
    const res = await adminRequest(`/api/tenants/${t.id}/photos/${crypto.randomUUID()}/thumb`)
    expect(res.status).toBe(404)
  })
})

describe('参加者', () => {
  type GuestRow = { id: string; nickname: string; photoCount: number; createdAt: string }

  it('登録済みの参加者だけを、投稿枚数つきで返す（未登録は含まない）', async () => {
    const t = await newTenant()
    const taro = await newGuest(t.id, 'taro')
    await newGuest(t.id, null)
    await newGuest(t.id, 'hanako')
    await newPhoto(t.id, taro.id)
    await newPhoto(t.id, taro.id)

    const res = await adminRequest(`/api/tenants/${t.id}/guests`)
    expect(res.status).toBe(200)
    const { guests } = (await res.json()) as { guests: GuestRow[] }
    expect(guests.map((g) => [g.nickname, g.photoCount])).toEqual([
      ['hanako', 0],
      ['taro', 2],
    ])
    expect(new Date(guests[0]?.createdAt ?? '').toISOString()).toBe(guests[0]?.createdAt)
  })

  const rename = (tenantId: string, guestId: string, nickname: unknown) =>
    adminRequest(`/api/tenants/${tenantId}/guests/${guestId}`, {
      method: 'PATCH',
      body: { nickname },
    })

  it('ニックネームを変更し、変更前後を監査ログに残す', async () => {
    const t = await newTenant()
    const guest = await newGuest(t.id, 'taro')
    const res = await rename(t.id, guest.id, '  ゲスト 1  ')
    expect(res.status).toBe(200)
    const row = await env.DB.prepare('SELECT nickname FROM guests WHERE id = ?')
      .bind(guest.id)
      .first<{ nickname: string }>()
    expect(row?.nickname).toBe('ゲスト 1')
    const log = (await auditRows(t.id)).at(-1)
    expect(log).toMatchObject({ action: 'guest.rename', targetId: guest.id })
    expect(JSON.parse(log?.detail ?? '{}')).toEqual({ before: 'taro', after: 'ゲスト 1' })
  })

  it('使用中は 409、空は REQUIRED、21 文字は TOO_LONG（20 文字は通る）', async () => {
    const t = await newTenant()
    const taro = await newGuest(t.id, 'taro')
    await newGuest(t.id, 'hanako')

    const taken = await rename(t.id, taro.id, 'hanako')
    expect(taken.status).toBe(409)
    expect(((await taken.json()) as ErrBody).error.code).toBe('NICKNAME_TAKEN')

    for (const [value, field] of [
      ['   ', 'REQUIRED'],
      [undefined, 'REQUIRED'],
      ['あ'.repeat(21), 'TOO_LONG'],
    ] as const) {
      const res = await rename(t.id, taro.id, value)
      expect(res.status).toBe(400)
      const err = ((await res.json()) as ErrBody).error
      expect(err.code).toBe('VALIDATION_ERROR')
      expect(err.fields).toEqual({ nickname: field })
    }
    expect((await rename(t.id, taro.id, 'あ'.repeat(20))).status).toBe(200)
    expect((await auditRows(t.id)).map((l) => l.action)).toEqual(['guest.rename'])
  })

  it('ない参加者・未登録の参加者は 404', async () => {
    const t = await newTenant()
    const pending = await newGuest(t.id, null)
    expect((await rename(t.id, crypto.randomUUID(), 'x')).status).toBe(404)
    expect((await rename(t.id, pending.id, 'x')).status).toBe(404)
  })
})
