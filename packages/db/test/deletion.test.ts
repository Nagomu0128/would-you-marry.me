import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import {
  addCourseMenuImage,
  createVisitorSession,
  deleteTenantData,
  deleteTenantObjects,
  getTenant,
  issueCoupleAccess,
  issueJoinToken,
  likePhoto,
  newId,
  recordAuditLog,
  upsertSeatingChart,
} from '../src'
import { count, db, makeGuest, makePhoto, makeTenant } from './helpers'

const TABLES = [
  'likes',
  'photos',
  'visitor_sessions',
  'guests',
  'join_tokens',
  'couple_accesses',
  'seating_charts',
  'course_menu_images',
]

async function populate(tenantId: string) {
  const a = await makeGuest(tenantId, 'a')
  const b = await makeGuest(tenantId, 'b')
  const photo = await makePhoto(tenantId, a.id)
  await likePhoto(db, tenantId, b.id, photo.id)
  await issueJoinToken(db, tenantId, `j-${newId()}`)
  const access = await issueCoupleAccess(db, tenantId, { token: `c-${newId()}`, passcodeHash: 'h' })
  await createVisitorSession(db, { idHash: newId(), tenantId, kind: 'guest', guestId: a.id })
  await createVisitorSession(db, {
    idHash: newId(),
    tenantId,
    kind: 'couple',
    coupleAccessId: access.id,
  })
  await upsertSeatingChart(db, tenantId, { r2Key: 'k', sizeBytes: 1 })
  await addCourseMenuImage(db, tenantId, {
    id: newId(),
    r2Key: 'k',
    contentType: 'image/png',
    sizeBytes: 1,
  })
  await recordAuditLog(db, { tenantId, actor: 'admin@example.com', action: 'tenant.create' })
}

describe('テナントのデータ削除（D1）', () => {
  it('全表の行が消え、tenants の行は残って data_deleted_at が入る', async () => {
    const tenant = await makeTenant()
    await populate(tenant.id)
    for (const table of TABLES) {
      expect(await count(table, `tenant_id = '${tenant.id}'`), table).toBeGreaterThan(0)
    }

    await deleteTenantData(db, tenant.id, 9999)

    for (const table of TABLES) {
      expect(await count(table, `tenant_id = '${tenant.id}'`), table).toBe(0)
    }
    expect(await getTenant(db, tenant.id)).toMatchObject({
      id: tenant.id,
      name: tenant.name,
      dataDeletedAt: 9999,
    })
    // 監査ログは残る（手順 3 で tenant.delete を記録する）
    expect(await count('audit_logs', `tenant_id = '${tenant.id}'`)).toBe(1)
  })

  it('他のテナントのデータは消えない', async () => {
    const target = await makeTenant()
    const other = await makeTenant()
    await populate(target.id)
    await populate(other.id)

    await deleteTenantData(db, target.id)

    for (const table of TABLES) {
      expect(await count(table, `tenant_id = '${other.id}'`), table).toBeGreaterThan(0)
    }
    expect((await getTenant(db, other.id))?.dataDeletedAt).toBeNull()
  })

  it('もう一度実行しても失敗しない（やり直せる）', async () => {
    const tenant = await makeTenant()
    await populate(tenant.id)
    await deleteTenantData(db, tenant.id)
    await deleteTenantData(db, tenant.id)
    expect((await getTenant(db, tenant.id))?.dataDeletedAt).not.toBeNull()
  })
})

describe('テナントのファイル削除（R2）', () => {
  it('該当テナントのプレフィックスのオブジェクトだけが消える', async () => {
    const a = newId()
    const b = newId()
    await env.BUCKET.put(`tenants/${a}/photos/p1/original.jpg`, 'x')
    await env.BUCKET.put(`tenants/${a}/seating-chart/u.pdf`, 'x')
    await env.BUCKET.put(`tenants/${a}/course-menu/i.png`, 'x')
    await env.BUCKET.put(`tenants/${b}/photos/p1/original.jpg`, 'x')
    // 先頭が同じでも別のテナントのもの（"tenants/<a>" で始まるが "/" で区切られない）
    await env.BUCKET.put(`tenants/${a}x/photos/p1/original.jpg`, 'x')

    expect(await deleteTenantObjects(env.BUCKET, a)).toBe(3)

    expect((await env.BUCKET.list({ prefix: `tenants/${a}/` })).objects).toHaveLength(0)
    expect((await env.BUCKET.list({ prefix: `tenants/${b}/` })).objects).toHaveLength(1)
    expect((await env.BUCKET.list({ prefix: `tenants/${a}x/` })).objects).toHaveLength(1)
  })

  it('オブジェクトがなければ 0 件', async () => {
    expect(await deleteTenantObjects(env.BUCKET, newId())).toBe(0)
  })

  it('1,000 件を超えても全部消える', async () => {
    const tenantId = newId()
    const puts: Promise<unknown>[] = []
    for (let i = 0; i < 1100; i++) {
      puts.push(env.BUCKET.put(`tenants/${tenantId}/photos/p${i}/thumb.jpg`, 'x'))
    }
    await Promise.all(puts)
    expect(await deleteTenantObjects(env.BUCKET, tenantId)).toBe(1100)
    expect((await env.BUCKET.list({ prefix: `tenants/${tenantId}/` })).objects).toHaveLength(0)
  }, 60_000)
})
