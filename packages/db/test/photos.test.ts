import { describe, expect, it } from 'vitest'
import {
  countGuestPhotos,
  deleteOwnPhoto,
  deletePhotoAsAdmin,
  getLikedPhotoIds,
  getPhoto,
  InvalidCursorError,
  insertPhotoWithLimit,
  likePhoto,
  listRanking,
  listTimeline,
  newId,
  photoKeys,
} from '../src'
import { count, db, makeGuest, makePhoto, makeTenant } from './helpers'

function photoInput(tenantId: string, guestId: string) {
  const id = newId()
  const keys = photoKeys(tenantId, id, 'image/png')
  return {
    id,
    guestId,
    originalKey: keys.original,
    displayKey: keys.display,
    thumbKey: keys.thumb,
    originalContentType: 'image/png' as const,
    storedSizeBytes: 500,
    width: 800,
    height: 600,
  }
}

describe('photos: 登録と上限', () => {
  it('登録すると取得できる', async () => {
    const tenant = await makeTenant()
    const guest = await makeGuest(tenant.id, 'a')
    const input = photoInput(tenant.id, guest.id)
    const result = await insertPhotoWithLimit(db, tenant.id, input, 100, 1234)
    expect(result.inserted).toBe(true)
    expect(await getPhoto(db, tenant.id, input.id)).toMatchObject({
      id: input.id,
      tenantId: tenant.id,
      guestId: guest.id,
      originalKey: input.originalKey,
      originalContentType: 'image/png',
      storedSizeBytes: 500,
      width: 800,
      height: 600,
      likeCount: 0,
      createdAt: 1234,
    })
  })

  it('上限ちょうどで登録できなくなり、削除すると再び登録できる', async () => {
    const tenant = await makeTenant()
    const guest = await makeGuest(tenant.id, 'a')
    const LIMIT = 3
    const ids: string[] = []
    for (let i = 0; i < LIMIT; i++) {
      const input = photoInput(tenant.id, guest.id)
      ids.push(input.id)
      expect((await insertPhotoWithLimit(db, tenant.id, input, LIMIT)).inserted).toBe(true)
    }
    expect(await countGuestPhotos(db, tenant.id, guest.id)).toBe(LIMIT)

    const rejected = photoInput(tenant.id, guest.id)
    expect(await insertPhotoWithLimit(db, tenant.id, rejected, LIMIT)).toEqual({ inserted: false })
    expect(await getPhoto(db, tenant.id, rejected.id)).toBeUndefined()
    expect(await countGuestPhotos(db, tenant.id, guest.id)).toBe(LIMIT)

    const [first] = ids
    expect(first).toBeDefined()
    await deleteOwnPhoto(db, tenant.id, guest.id, first as string)
    expect((await insertPhotoWithLimit(db, tenant.id, rejected, LIMIT)).inserted).toBe(true)
  })

  it('上限は参加者ごと。他の参加者の枚数は数えない', async () => {
    const tenant = await makeTenant()
    const a = await makeGuest(tenant.id, 'a')
    const b = await makeGuest(tenant.id, 'b')
    await insertPhotoWithLimit(db, tenant.id, photoInput(tenant.id, a.id), 1)
    expect(
      (await insertPhotoWithLimit(db, tenant.id, photoInput(tenant.id, b.id), 1)).inserted,
    ).toBe(true)
  })

  it('同時に登録しても上限を超えない', async () => {
    const tenant = await makeTenant()
    const guest = await makeGuest(tenant.id, 'a')
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        insertPhotoWithLimit(db, tenant.id, photoInput(tenant.id, guest.id), 5),
      ),
    )
    expect(results.filter((r) => r.inserted)).toHaveLength(5)
    expect(await countGuestPhotos(db, tenant.id, guest.id)).toBe(5)
  })

  it('別のテナントの参加者の写真としては登録できない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const guest = await makeGuest(a.id, 'a')
    const result = await insertPhotoWithLimit(db, b.id, photoInput(b.id, guest.id), 100)
    expect(result).toEqual({ inserted: false })
    expect(await count('photos', `guest_id = '${guest.id}'`)).toBe(0)
  })
})

describe('photos: 取得・削除とテナント分離', () => {
  it('他のテナントの写真は取得できない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const guest = await makeGuest(a.id, 'a')
    const photo = await makePhoto(a.id, guest.id)
    expect(await getPhoto(db, b.id, photo.id)).toBeUndefined()
  })

  it('投稿者本人だけが削除できる。他人・他のテナントからは削除できない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const owner = await makeGuest(a.id, 'owner')
    const other = await makeGuest(a.id, 'other')
    const photo = await makePhoto(a.id, owner.id)

    expect(await deleteOwnPhoto(db, a.id, other.id, photo.id)).toBeUndefined()
    expect(await deleteOwnPhoto(db, b.id, owner.id, photo.id)).toBeUndefined()
    expect(await getPhoto(db, a.id, photo.id)).toBeDefined()

    const deleted = await deleteOwnPhoto(db, a.id, owner.id, photo.id)
    expect(deleted?.id).toBe(photo.id)
    expect(deleted?.thumbKey).toBe(photo.thumbKey) // R2 のキーを返す
    expect(await getPhoto(db, a.id, photo.id)).toBeUndefined()
  })

  it('管理者用の削除は投稿者を問わないが、他のテナントの写真は消せない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const guest = await makeGuest(a.id, 'a')
    const photo = await makePhoto(a.id, guest.id)
    expect(await deletePhotoAsAdmin(db, b.id, photo.id)).toBeUndefined()
    expect(await getPhoto(db, a.id, photo.id)).toBeDefined()
    expect((await deletePhotoAsAdmin(db, a.id, photo.id))?.id).toBe(photo.id)
    expect(await getPhoto(db, a.id, photo.id)).toBeUndefined()
    expect(await deletePhotoAsAdmin(db, a.id, photo.id)).toBeUndefined()
  })

  it('いいね済みの判定は自分のものだけ・指定した写真だけ・テナント内だけ', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const me = await makeGuest(a.id, 'me')
    const you = await makeGuest(a.id, 'you')
    const p1 = await makePhoto(a.id, you.id)
    const p2 = await makePhoto(a.id, you.id)
    const p3 = await makePhoto(a.id, you.id)
    await likePhoto(db, a.id, me.id, p1.id)
    await likePhoto(db, a.id, you.id, p2.id)

    expect(await getLikedPhotoIds(db, a.id, me.id, [p1.id, p2.id, p3.id])).toEqual(new Set([p1.id]))
    expect(await getLikedPhotoIds(db, a.id, me.id, [])).toEqual(new Set())
    expect(await getLikedPhotoIds(db, b.id, me.id, [p1.id])).toEqual(new Set())
    const many = Array.from({ length: 120 }, () => newId())
    expect(await getLikedPhotoIds(db, a.id, me.id, [...many, p1.id])).toEqual(new Set([p1.id]))
  })
})

describe('photos: タイムライン', () => {
  it('新しい順に、投稿者つきで返す。他のテナントの写真を含まない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const guest = await makeGuest(a.id, 'たろう')
    const other = await makeGuest(b.id, 'はなこ')
    const old = await makePhoto(a.id, guest.id, { createdAt: 100 })
    const recent = await makePhoto(a.id, guest.id, { createdAt: 200 })
    await makePhoto(b.id, other.id, { createdAt: 300 })

    const page = await listTimeline(db, a.id, { limit: 30 })
    expect(page.photos.map((p) => p.photo.id)).toEqual([recent.id, old.id])
    expect(page.photos[0]?.uploader).toEqual({ id: guest.id, nickname: 'たろう' })
    expect(page.nextCursor).toBeNull()
  })

  it('同じ created_at の写真があっても、カーソルで重複・欠落なく全件たどれる', async () => {
    const tenant = await makeTenant()
    const guest = await makeGuest(tenant.id, 'a')
    const expected: string[] = []
    // 同じ時刻の写真を多数含める
    for (let i = 0; i < 23; i++) {
      const photo = await makePhoto(tenant.id, guest.id, { createdAt: 1000 + Math.floor(i / 5) })
      expected.push(photo.id)
    }

    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const page: Awaited<ReturnType<typeof listTimeline>> = await listTimeline(db, tenant.id, {
        cursor,
        limit: 4,
      })
      seen.push(...page.photos.map((p) => p.photo.id))
      cursor = page.nextCursor
      pages++
    } while (cursor !== null)

    expect(pages).toBe(6) // 23 件を 4 件ずつ
    expect(seen).toHaveLength(23)
    expect(new Set(seen)).toEqual(new Set(expected))
    // 並びは (created_at, id) の降順
    const rows = await Promise.all(seen.map((id) => getPhoto(db, tenant.id, id)))
    const keys = rows.map((p) => `${String(p?.createdAt).padStart(15, '0')}_${p?.id}`)
    expect(keys).toEqual([...keys].sort().reverse())
  })

  it('ちょうど limit 件で終わるとき、nextCursor は null', async () => {
    const tenant = await makeTenant()
    const guest = await makeGuest(tenant.id, 'a')
    for (let i = 0; i < 3; i++) await makePhoto(tenant.id, guest.id, { createdAt: i })
    const page = await listTimeline(db, tenant.id, { limit: 3 })
    expect(page.photos).toHaveLength(3)
    expect(page.nextCursor).toBeNull()
  })

  it('カーソルは最後の写真の createdAt_id', async () => {
    const tenant = await makeTenant()
    const guest = await makeGuest(tenant.id, 'a')
    await makePhoto(tenant.id, guest.id, { createdAt: 10 })
    const second = await makePhoto(tenant.id, guest.id, { createdAt: 20 })
    await makePhoto(tenant.id, guest.id, { createdAt: 30 })
    const page = await listTimeline(db, tenant.id, { limit: 2 })
    expect(page.nextCursor).toBe(`20_${second.id}`)
  })

  it('投稿者で絞り込める', async () => {
    const tenant = await makeTenant()
    const a = await makeGuest(tenant.id, 'a')
    const b = await makeGuest(tenant.id, 'b')
    const pa = await makePhoto(tenant.id, a.id, { createdAt: 1 })
    await makePhoto(tenant.id, b.id, { createdAt: 2 })
    const page = await listTimeline(db, tenant.id, { limit: 30, guestId: a.id })
    expect(page.photos.map((p) => p.photo.id)).toEqual([pa.id])
  })

  it('他のテナントの参加者で絞り込むと空', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const guest = await makeGuest(a.id, 'a')
    await makePhoto(a.id, guest.id)
    const page = await listTimeline(db, b.id, { limit: 30, guestId: guest.id })
    expect(page.photos).toEqual([])
  })

  it('不正なカーソルは InvalidCursorError', async () => {
    const tenant = await makeTenant()
    for (const cursor of ['abc', '_x', '12_', 'x_12', '-1_a']) {
      await expect(listTimeline(db, tenant.id, { cursor, limit: 5 })).rejects.toBeInstanceOf(
        InvalidCursorError,
      )
    }
  })
})

describe('photos: ランキング', () => {
  it('いいね 0 件の写真を含まず、いいね数の多い順・同数は先に投稿されたものが上', async () => {
    const tenant = await makeTenant()
    const owner = await makeGuest(tenant.id, 'owner')
    const voters = await Promise.all([1, 2, 3].map((i) => makeGuest(tenant.id, `v${i}`)))
    const zero = await makePhoto(tenant.id, owner.id, { createdAt: 1 })
    const olderOne = await makePhoto(tenant.id, owner.id, { createdAt: 2 })
    const newerOne = await makePhoto(tenant.id, owner.id, { createdAt: 3 })
    const three = await makePhoto(tenant.id, owner.id, { createdAt: 4 })
    // 同数でも投稿が新しい方を先に「いいね」して、いいねの順では決まらないことを確かめる
    await likePhoto(db, tenant.id, voters[0]?.id as string, newerOne.id)
    await likePhoto(db, tenant.id, voters[0]?.id as string, olderOne.id)
    for (const voter of voters) await likePhoto(db, tenant.id, voter.id, three.id)

    const ranking = await listRanking(db, tenant.id)
    expect(ranking.map((p) => p.photo.id)).toEqual([three.id, olderOne.id, newerOne.id])
    expect(ranking.map((p) => p.photo.likeCount)).toEqual([3, 1, 1])
    expect(ranking.some((p) => p.photo.id === zero.id)).toBe(false)
    expect(ranking[0]?.uploader.nickname).toBe('owner')
  })

  it('最大 10 件', async () => {
    const tenant = await makeTenant()
    const guest = await makeGuest(tenant.id, 'a')
    for (let i = 0; i < 13; i++) {
      const photo = await makePhoto(tenant.id, guest.id, { createdAt: i })
      await likePhoto(db, tenant.id, guest.id, photo.id)
    }
    expect(await listRanking(db, tenant.id)).toHaveLength(10)
    expect(await listRanking(db, tenant.id, 3)).toHaveLength(3)
  })

  it('他のテナントの写真を含まない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const guest = await makeGuest(b.id, 'a')
    const photo = await makePhoto(b.id, guest.id)
    await likePhoto(db, b.id, guest.id, photo.id)
    expect(await listRanking(db, a.id)).toEqual([])
  })
})
