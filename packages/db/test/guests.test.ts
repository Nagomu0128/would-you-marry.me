import { describe, expect, it } from 'vitest'
import {
  createGuest,
  getGuest,
  listGuests,
  listUploaders,
  newId,
  recordGuestTermsAgreement,
  setGuestNickname,
  touchGuestLastSeen,
} from '../src'
import { db, makeGuest, makePhoto, makeTenant } from './helpers'

const nick = (nickname: string) => ({ nickname, nicknameKey: nickname.trim() })

describe('guests', () => {
  it('作成すると、ニックネーム・規約同意は未登録', async () => {
    const tenant = await makeTenant()
    const guest = await createGuest(db, tenant.id, 1000)
    expect(guest).toMatchObject({
      tenantId: tenant.id,
      nickname: null,
      nicknameKey: null,
      termsAgreedAt: null,
      createdAt: 1000,
      lastSeenAt: 1000,
    })
    expect(await getGuest(db, tenant.id, guest.id)).toEqual(guest)
  })

  it('ニックネームを設定・変更できる', async () => {
    const tenant = await makeTenant()
    const guest = await createGuest(db, tenant.id)
    const result = await setGuestNickname(db, tenant.id, guest.id, nick('たろう'))
    expect(result).toMatchObject({ ok: true, guest: { nickname: 'たろう', nicknameKey: 'たろう' } })
    // 自分と同じ名前に設定し直しても「使用中」にならない
    expect((await setGuestNickname(db, tenant.id, guest.id, nick('たろう'))).ok).toBe(true)
    expect((await setGuestNickname(db, tenant.id, guest.id, nick('じろう'))).ok).toBe(true)
  })

  it('同じテナントで同じニックネームは使用中として返す（例外を投げない）', async () => {
    const tenant = await makeTenant()
    await makeGuest(tenant.id, 'たろう')
    const other = await createGuest(db, tenant.id)
    expect(await setGuestNickname(db, tenant.id, other.id, nick('たろう'))).toEqual({
      ok: false,
      reason: 'taken',
    })
    // 重複した設定は反映されていない
    expect((await getGuest(db, tenant.id, other.id))?.nickname).toBeNull()
  })

  it('別のテナントなら同じニックネームを使える', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    await makeGuest(a.id, 'たろう')
    const guest = await createGuest(db, b.id)
    expect((await setGuestNickname(db, b.id, guest.id, nick('たろう'))).ok).toBe(true)
  })

  it('ニックネーム未登録（NULL）の参加者は、何人いても重複にならない', async () => {
    const tenant = await makeTenant()
    await createGuest(db, tenant.id)
    await createGuest(db, tenant.id)
    await createGuest(db, tenant.id)
    expect(await listGuests(db, tenant.id)).toHaveLength(3)
  })

  it('他のテナントの参加者のニックネームは変更できない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const guest = await makeGuest(a.id, 'たろう')
    expect(await setGuestNickname(db, b.id, guest.id, nick('ハッカー'))).toEqual({
      ok: false,
      reason: 'not_found',
    })
    expect((await getGuest(db, a.id, guest.id))?.nickname).toBe('たろう')
  })

  it('他のテナントの参加者は取得できない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const guest = await makeGuest(a.id, 'たろう')
    expect(await getGuest(db, b.id, guest.id)).toBeUndefined()
  })

  it('規約への同意は最初の日時を残す。他のテナントからは記録できない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const guest = await makeGuest(a.id, 'たろう')
    await recordGuestTermsAgreement(db, b.id, guest.id, 111)
    expect((await getGuest(db, a.id, guest.id))?.termsAgreedAt).toBeNull()
    await recordGuestTermsAgreement(db, a.id, guest.id, 222)
    await recordGuestTermsAgreement(db, a.id, guest.id, 333)
    expect((await getGuest(db, a.id, guest.id))?.termsAgreedAt).toBe(222)
  })

  it('一覧は投稿枚数つき。他のテナントの参加者を含まない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const g1 = await makeGuest(a.id, 'b')
    const g2 = await makeGuest(a.id, 'a')
    const g3 = await makeGuest(a.id)
    const other = await makeGuest(b.id, 'c')
    await makePhoto(a.id, g1.id)
    await makePhoto(a.id, g1.id)
    await makePhoto(b.id, other.id)

    const list = await listGuests(db, a.id)
    expect(list.map((g) => [g.id, g.photoCount])).toEqual([
      [g2.id, 0], // ニックネーム順
      [g1.id, 2],
      [g3.id, 0], // 未登録は最後
    ])
  })

  it('投稿者の一覧は、1 枚以上投稿した人だけ・ニックネーム順・枚数つき', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const zeta = await makeGuest(a.id, 'zeta')
    const alpha = await makeGuest(a.id, 'alpha')
    await makeGuest(a.id, 'no-photo')
    const other = await makeGuest(b.id, 'beta')
    await makePhoto(a.id, zeta.id)
    await makePhoto(a.id, alpha.id)
    await makePhoto(a.id, alpha.id)
    await makePhoto(b.id, other.id)

    expect(await listUploaders(db, a.id)).toEqual([
      { id: alpha.id, nickname: 'alpha', photoCount: 2 },
      { id: zeta.id, nickname: 'zeta', photoCount: 1 },
    ])
  })

  it('last_seen_at は間隔があいたときだけ更新する', async () => {
    const tenant = await makeTenant()
    const other = await makeTenant()
    const guest = await createGuest(db, tenant.id, 1_000_000)
    const TEN_MIN = 10 * 60 * 1000

    // 間隔未満 → 更新しない
    expect(
      await touchGuestLastSeen(db, tenant.id, guest.id, TEN_MIN, 1_000_000 + TEN_MIN - 1),
    ).toBe(false)
    expect((await getGuest(db, tenant.id, guest.id))?.lastSeenAt).toBe(1_000_000)
    // 他のテナントからは更新できない
    expect(await touchGuestLastSeen(db, other.id, guest.id, TEN_MIN, 9_000_000)).toBe(false)
    // 間隔ちょうど → 更新する
    expect(await touchGuestLastSeen(db, tenant.id, guest.id, TEN_MIN, 1_000_000 + TEN_MIN)).toBe(
      true,
    )
    expect((await getGuest(db, tenant.id, guest.id))?.lastSeenAt).toBe(1_000_000 + TEN_MIN)
    expect(await touchGuestLastSeen(db, tenant.id, newId(), TEN_MIN, 9_000_000)).toBe(false)
  })
})
