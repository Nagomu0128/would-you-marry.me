import { describe, expect, it } from 'vitest'
import {
  addCourseMenuImage,
  createTenant,
  deleteTenantData,
  getTenant,
  getTenantStats,
  likePhoto,
  listDeletionCandidates,
  listTenantsWithStats,
  newId,
  updateTenant,
  upsertSeatingChart,
} from '../src'
import { db, makeGuest, makePhoto, makeTenant } from './helpers'

describe('tenants', () => {
  it('作成して取得できる', async () => {
    const tenant = await createTenant(
      db,
      { name: '〇〇家・△△家 結婚式', eventDate: '2026-10-31', createdBy: 'admin@example.com' },
      1000,
    )
    expect(tenant).toMatchObject({
      name: '〇〇家・△△家 結婚式',
      eventDate: '2026-10-31',
      suspended: false,
      createdBy: 'admin@example.com',
      createdAt: 1000,
      updatedAt: 1000,
      dataDeletedAt: null,
    })
    expect(tenant.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await getTenant(db, tenant.id)).toEqual(tenant)
    expect(await getTenant(db, newId())).toBeUndefined()
  })

  it('名前・開催日・停止状態を変更できる。省略した項目はそのまま', async () => {
    const tenant = await makeTenant()
    const updated = await updateTenant(db, tenant.id, { suspended: true }, 5000)
    expect(updated).toMatchObject({ name: tenant.name, suspended: true, updatedAt: 5000 })
    const renamed = await updateTenant(db, tenant.id, {
      name: '新しい名前',
      eventDate: '2026-11-01',
    })
    expect(renamed).toMatchObject({ name: '新しい名前', eventDate: '2026-11-01', suspended: true })
  })

  it('データ削除済みのテナントは変更できない', async () => {
    const tenant = await makeTenant()
    await deleteTenantData(db, tenant.id)
    expect(await updateTenant(db, tenant.id, { name: 'x' })).toBeUndefined()
  })

  it('存在しないテナントの変更は undefined', async () => {
    expect(await updateTenant(db, newId(), { name: 'x' })).toBeUndefined()
  })

  it('利用状況: 参加者数（ニックネーム登録済み）・写真枚数・いいね数・保存容量', async () => {
    const tenant = await makeTenant()
    const other = await makeTenant()
    const a = await makeGuest(tenant.id, 'a')
    const b = await makeGuest(tenant.id, 'b')
    await makeGuest(tenant.id) // ニックネーム未登録 → 参加者数に含めない
    const p1 = await makePhoto(tenant.id, a.id, { storedSizeBytes: 100 })
    await makePhoto(tenant.id, b.id, { storedSizeBytes: 200 })
    await likePhoto(db, tenant.id, a.id, p1.id)
    await likePhoto(db, tenant.id, b.id, p1.id)
    await upsertSeatingChart(db, tenant.id, { r2Key: 'k1', sizeBytes: 1000 })
    await addCourseMenuImage(db, tenant.id, {
      id: newId(),
      r2Key: 'k2',
      contentType: 'image/png',
      sizeBytes: 10_000,
    })
    // 他のテナントのデータは含めない
    const otherGuest = await makeGuest(other.id, 'a')
    await makePhoto(other.id, otherGuest.id, { storedSizeBytes: 999_999 })

    expect(await getTenantStats(db, tenant.id)).toEqual({
      guestCount: 2,
      photoCount: 2,
      likeCount: 2,
      storageBytes: 100 + 200 + 1000 + 10_000,
    })

    const list = await listTenantsWithStats(db)
    expect(list.find((t) => t.id === tenant.id)?.stats.storageBytes).toBe(11_300)
    expect(list.find((t) => t.id === other.id)?.stats.photoCount).toBe(1)
  })

  it('何もないテナントの利用状況は 0。getTenantStats は存在しないテナントなら undefined', async () => {
    const tenant = await makeTenant()
    expect(await getTenantStats(db, tenant.id)).toEqual({
      guestCount: 0,
      photoCount: 0,
      likeCount: 0,
      storageBytes: 0,
    })
    expect(await getTenantStats(db, newId())).toBeUndefined()
  })

  it('一覧は開催日の新しい順', async () => {
    const old = await makeTenant('2020-01-01')
    const recent = await makeTenant('2099-01-01')
    const ids = (await listTenantsWithStats(db)).map((t) => t.id)
    expect(ids.indexOf(recent.id)).toBeLessThan(ids.indexOf(old.id))
  })

  it('削除対象の候補: 削除済みでなく、開催日が指定日以前のもの', async () => {
    const old = await makeTenant('2019-01-01')
    const oldDeleted = await makeTenant('2019-01-02')
    const boundary = await makeTenant('2019-06-30')
    const recent = await makeTenant('2099-01-01')
    await deleteTenantData(db, oldDeleted.id)

    const ids = (await listDeletionCandidates(db, '2019-06-30')).map((t) => t.id)
    expect(ids).toContain(old.id)
    expect(ids).toContain(boundary.id)
    expect(ids).not.toContain(oldDeleted.id)
    expect(ids).not.toContain(recent.id)
  })
})
