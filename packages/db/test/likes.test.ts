import { describe, expect, it } from 'vitest'
import { getPhoto, likePhoto, newId, unlikePhoto } from '../src'
import { count, db, makeGuest, makePhoto, makeTenant } from './helpers'

describe('likes', () => {
  it('いいねすると件数が 1 になり、likedByMe が true', async () => {
    const tenant = await makeTenant()
    const owner = await makeGuest(tenant.id, 'owner')
    const me = await makeGuest(tenant.id, 'me')
    const photo = await makePhoto(tenant.id, owner.id)
    expect(await likePhoto(db, tenant.id, me.id, photo.id)).toEqual({
      likeCount: 1,
      likedByMe: true,
    })
  })

  it('2 回目のいいねで件数は増えない（何度実行しても同じ結果）', async () => {
    const tenant = await makeTenant()
    const me = await makeGuest(tenant.id, 'me')
    const photo = await makePhoto(tenant.id, me.id)
    await likePhoto(db, tenant.id, me.id, photo.id)
    expect(await likePhoto(db, tenant.id, me.id, photo.id)).toEqual({
      likeCount: 1,
      likedByMe: true,
    })
    expect(await count('likes', `photo_id = '${photo.id}'`)).toBe(1)
  })

  it('自分の写真にもいいねできる', async () => {
    const tenant = await makeTenant()
    const me = await makeGuest(tenant.id, 'me')
    const photo = await makePhoto(tenant.id, me.id)
    expect(await likePhoto(db, tenant.id, me.id, photo.id)).toEqual({
      likeCount: 1,
      likedByMe: true,
    })
  })

  it('取り消すと件数が減る。取り消しも何度実行しても同じ結果', async () => {
    const tenant = await makeTenant()
    const a = await makeGuest(tenant.id, 'a')
    const b = await makeGuest(tenant.id, 'b')
    const photo = await makePhoto(tenant.id, a.id)
    await likePhoto(db, tenant.id, a.id, photo.id)
    await likePhoto(db, tenant.id, b.id, photo.id)

    expect(await unlikePhoto(db, tenant.id, a.id, photo.id)).toEqual({
      likeCount: 1,
      likedByMe: false,
    })
    expect(await unlikePhoto(db, tenant.id, a.id, photo.id)).toEqual({
      likeCount: 1,
      likedByMe: false,
    })
    expect(await unlikePhoto(db, tenant.id, b.id, photo.id)).toEqual({
      likeCount: 0,
      likedByMe: false,
    })
  })

  it('いいね数は likes の行数と一致する', async () => {
    const tenant = await makeTenant()
    const owner = await makeGuest(tenant.id, 'owner')
    const guests = await Promise.all(['a', 'b', 'c', 'd'].map((n) => makeGuest(tenant.id, n)))
    const photo = await makePhoto(tenant.id, owner.id)
    for (const guest of guests) await likePhoto(db, tenant.id, guest.id, photo.id)
    await unlikePhoto(db, tenant.id, guests[1]?.id as string, photo.id)
    await likePhoto(db, tenant.id, guests[0]?.id as string, photo.id)

    const rows = await count('likes', `photo_id = '${photo.id}'`)
    expect(rows).toBe(3)
    expect((await getPhoto(db, tenant.id, photo.id))?.likeCount).toBe(rows)
  })

  it('同時にいいねしても件数が一致する', async () => {
    const tenant = await makeTenant()
    const owner = await makeGuest(tenant.id, 'owner')
    const guests = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((n) => makeGuest(tenant.id, n)))
    const photo = await makePhoto(tenant.id, owner.id)
    await Promise.all([
      ...guests.map((g) => likePhoto(db, tenant.id, g.id, photo.id)),
      ...guests.map((g) => likePhoto(db, tenant.id, g.id, photo.id)),
    ])
    expect((await getPhoto(db, tenant.id, photo.id))?.likeCount).toBe(5)
    expect(await count('likes', `photo_id = '${photo.id}'`)).toBe(5)
  })

  it('他のテナントの写真にはいいねできない（何もしない）', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const ownerA = await makeGuest(a.id, 'owner')
    const guestB = await makeGuest(b.id, 'guest')
    const photo = await makePhoto(a.id, ownerA.id)

    // テナント B の参加者が、テナント A の写真に（どちらのテナント ID でも）いいねできない
    expect(await likePhoto(db, b.id, guestB.id, photo.id)).toBeUndefined()
    expect(await likePhoto(db, a.id, guestB.id, photo.id)).toBeUndefined()
    expect(await count('likes', `photo_id = '${photo.id}'`)).toBe(0)
    expect((await getPhoto(db, a.id, photo.id))?.likeCount).toBe(0)
  })

  it('他のテナントの写真のいいねは取り消せない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const guestA = await makeGuest(a.id, 'a')
    const photo = await makePhoto(a.id, guestA.id)
    await likePhoto(db, a.id, guestA.id, photo.id)

    expect(await unlikePhoto(db, b.id, guestA.id, photo.id)).toBeUndefined()
    expect((await getPhoto(db, a.id, photo.id))?.likeCount).toBe(1)
    expect(await count('likes', `photo_id = '${photo.id}'`)).toBe(1)
  })

  it('存在しない写真・参加者は undefined', async () => {
    const tenant = await makeTenant()
    const me = await makeGuest(tenant.id, 'me')
    const photo = await makePhoto(tenant.id, me.id)
    expect(await likePhoto(db, tenant.id, me.id, newId())).toBeUndefined()
    expect(await likePhoto(db, tenant.id, newId(), photo.id)).toBeUndefined()
    expect(await unlikePhoto(db, tenant.id, me.id, newId())).toBeUndefined()
  })
})
