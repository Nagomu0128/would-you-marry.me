import { describe, expect, it } from 'vitest'
import {
  addCourseMenuImage,
  courseMenuImageKey,
  deleteCourseMenuImage,
  getCourseMenuImage,
  getSeatingChart,
  listCourseMenuImages,
  newId,
  photoKeys,
  recordAuditLog,
  reorderCourseMenuImages,
  seatingChartKey,
  tenantPrefix,
  upsertSeatingChart,
} from '../src'
import { count, db, makeTenant } from './helpers'

describe('seating_charts', () => {
  it('登録・差し替えで、古い R2 キーを返す', async () => {
    const tenant = await makeTenant()
    expect(await getSeatingChart(db, tenant.id)).toBeUndefined()

    const first = await upsertSeatingChart(db, tenant.id, { r2Key: 'k1', sizeBytes: 10 }, 100)
    expect(first).toEqual({
      chart: { tenantId: tenant.id, r2Key: 'k1', sizeBytes: 10, uploadedAt: 100 },
      replacedR2Key: null,
    })

    const second = await upsertSeatingChart(db, tenant.id, { r2Key: 'k2', sizeBytes: 20 }, 200)
    expect(second.replacedR2Key).toBe('k1')
    expect(await getSeatingChart(db, tenant.id)).toEqual({
      tenantId: tenant.id,
      r2Key: 'k2',
      sizeBytes: 20,
      uploadedAt: 200,
    })
    expect(await count('seating_charts', `tenant_id = '${tenant.id}'`)).toBe(1)
  })

  it('同じキーで差し替えたときは、消してはいけないので null を返す', async () => {
    const tenant = await makeTenant()
    await upsertSeatingChart(db, tenant.id, { r2Key: 'same', sizeBytes: 1 })
    expect(
      (await upsertSeatingChart(db, tenant.id, { r2Key: 'same', sizeBytes: 2 })).replacedR2Key,
    ).toBeNull()
  })

  it('他のテナントの席次表は取得できず、差し替えにも影響しない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    await upsertSeatingChart(db, a.id, { r2Key: 'ka', sizeBytes: 1 })
    expect(await getSeatingChart(db, b.id)).toBeUndefined()
    const result = await upsertSeatingChart(db, b.id, { r2Key: 'kb', sizeBytes: 1 })
    expect(result.replacedR2Key).toBeNull()
    expect((await getSeatingChart(db, a.id))?.r2Key).toBe('ka')
  })
})

describe('course_menu_images', () => {
  async function add(tenantId: string) {
    const id = newId()
    return addCourseMenuImage(db, tenantId, {
      id,
      r2Key: courseMenuImageKey(tenantId, id, 'image/jpeg'),
      contentType: 'image/jpeg',
      sizeBytes: 100,
    })
  }

  it('末尾に追加され、表示順（0 から）で一覧できる', async () => {
    const tenant = await makeTenant()
    const a = await add(tenant.id)
    const b = await add(tenant.id)
    const c = await add(tenant.id)
    expect([a.sortOrder, b.sortOrder, c.sortOrder]).toEqual([0, 1, 2])
    expect((await listCourseMenuImages(db, tenant.id)).map((i) => i.id)).toEqual([a.id, b.id, c.id])
  })

  it('他のテナントの画像は一覧・取得できず、順序にも影響しない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const imageA = await add(a.id)
    const imageB = await add(b.id)
    expect(imageB.sortOrder).toBe(0)
    expect(await listCourseMenuImages(db, b.id)).toHaveLength(1)
    expect(await getCourseMenuImage(db, b.id, imageA.id)).toBeUndefined()
    expect(await getCourseMenuImage(db, a.id, imageA.id)).toEqual(imageA)
  })

  it('削除すると行を返し、残りの表示順を 0 から詰める', async () => {
    const tenant = await makeTenant()
    const a = await add(tenant.id)
    const b = await add(tenant.id)
    const c = await add(tenant.id)
    const deleted = await deleteCourseMenuImage(db, tenant.id, b.id)
    expect(deleted?.r2Key).toBe(b.r2Key)
    const rest = await listCourseMenuImages(db, tenant.id)
    expect(rest.map((i) => [i.id, i.sortOrder])).toEqual([
      [a.id, 0],
      [c.id, 1],
    ])
    expect(await deleteCourseMenuImage(db, tenant.id, b.id)).toBeUndefined()
  })

  it('他のテナントの画像は削除できない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const image = await add(a.id)
    expect(await deleteCourseMenuImage(db, b.id, image.id)).toBeUndefined()
    expect(await getCourseMenuImage(db, a.id, image.id)).toBeDefined()
  })

  it('並べ替え: すべての画像 ID がそろっているときだけ反映する', async () => {
    const tenant = await makeTenant()
    const a = await add(tenant.id)
    const b = await add(tenant.id)
    const c = await add(tenant.id)

    expect(await reorderCourseMenuImages(db, tenant.id, [c.id, a.id, b.id])).toBe(true)
    expect((await listCourseMenuImages(db, tenant.id)).map((i) => i.id)).toEqual([c.id, a.id, b.id])

    // 不足・重複・余分な ID・他のテナントの ID は拒否し、順序を変えない
    expect(await reorderCourseMenuImages(db, tenant.id, [a.id, b.id])).toBe(false)
    expect(await reorderCourseMenuImages(db, tenant.id, [a.id, a.id, b.id])).toBe(false)
    expect(await reorderCourseMenuImages(db, tenant.id, [a.id, b.id, c.id, newId()])).toBe(false)
    expect(await reorderCourseMenuImages(db, tenant.id, [a.id, b.id, newId()])).toBe(false)
    expect((await listCourseMenuImages(db, tenant.id)).map((i) => i.id)).toEqual([c.id, a.id, b.id])
  })

  it('他のテナントの画像 ID を混ぜた並べ替えは拒否される', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const imageA = await add(a.id)
    const imageB = await add(b.id)
    expect(await reorderCourseMenuImages(db, a.id, [imageB.id])).toBe(false)
    expect((await getCourseMenuImage(db, b.id, imageB.id))?.sortOrder).toBe(0)
    expect((await getCourseMenuImage(db, a.id, imageA.id))?.sortOrder).toBe(0)
  })

  it('画像が 1 つもないテナントでは、空の並べ替えが成功する', async () => {
    const tenant = await makeTenant()
    expect(await reorderCourseMenuImages(db, tenant.id, [])).toBe(true)
  })
})

describe('audit_logs', () => {
  it('記録できる。detail は JSON で保存する', async () => {
    const tenant = await makeTenant()
    const log = await recordAuditLog(
      db,
      {
        tenantId: tenant.id,
        actor: 'admin@example.com',
        action: 'guest.rename',
        targetId: 'guest-1',
        detail: { before: 'a', after: 'b' },
      },
      777,
    )
    expect(log).toMatchObject({
      tenantId: tenant.id,
      actor: 'admin@example.com',
      action: 'guest.rename',
      targetId: 'guest-1',
      detail: '{"before":"a","after":"b"}',
      createdAt: 777,
    })
    expect(await count('audit_logs', `id = '${log.id}'`)).toBe(1)
  })

  it('テナント・対象・詳細は省略できる', async () => {
    const log = await recordAuditLog(db, { actor: 'system', action: 'tenant.delete' })
    expect(log).toMatchObject({ tenantId: null, targetId: null, detail: null })
  })
})

describe('R2 のキー', () => {
  it('database.md の設計どおり', () => {
    expect(tenantPrefix('T')).toBe('tenants/T/')
    expect(photoKeys('T', 'P', 'image/jpeg')).toEqual({
      original: 'tenants/T/photos/P/original.jpg',
      display: 'tenants/T/photos/P/display.jpg',
      thumb: 'tenants/T/photos/P/thumb.jpg',
    })
    expect(photoKeys('T', 'P', 'image/png').original).toBe('tenants/T/photos/P/original.png')
    expect(seatingChartKey('T', 'U')).toBe('tenants/T/seating-chart/U.pdf')
    expect(courseMenuImageKey('T', 'I', 'image/png')).toBe('tenants/T/course-menu/I.png')
    expect(courseMenuImageKey('T', 'I', 'image/jpeg')).toBe('tenants/T/course-menu/I.jpg')
  })
})
