import { env } from 'cloudflare:workers'
import {
  createGuest,
  createTenant,
  insertPhotoWithLimit,
  photoKeys,
  setGuestNickname,
} from '@wym/db'
import { beforeEach, describe, expect, it } from 'vitest'
import { ADMIN_EMAIL, adminRequest, db, request, resetStorage } from './helpers'

beforeEach(resetStorage)

type ErrBody = { error: { code: string; fields?: Record<string, string> } }
type TenantBody = {
  tenant: {
    id: string
    name: string
    eventDate: string
    phase: string
    suspended: boolean
    dataDeletedAt: string | null
    stats: { guestCount: number; photoCount: number; likeCount: number; storageBytes: number }
  }
  boundaries?: Record<string, string>
}

async function audit(tenantId: string) {
  const { results } = await env.DB.prepare(
    'SELECT actor, action, detail FROM audit_logs WHERE tenant_id = ? ORDER BY created_at, rowid',
  )
    .bind(tenantId)
    .all<{ actor: string; action: string; detail: string | null }>()
  return results
}

async function create(name = 'A家・B家 結婚式', eventDate = '2026-10-31') {
  const res = await adminRequest('/api/tenants', { method: 'POST', body: { name, eventDate } })
  return { res, body: (await res.json()) as TenantBody }
}

describe('POST /api/tenants', () => {
  it('201 で作成し、UUID v4 を採番し、tenant.create を記録する', async () => {
    const { res, body } = await create('  A家・B家 結婚式  ')
    expect(res.status).toBe(201)
    expect(body.tenant.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(body.tenant.name).toBe('A家・B家 結婚式')
    expect(body.tenant.suspended).toBe(false)
    expect(body.tenant.stats.photoCount).toBe(0)
    const logs = await audit(body.tenant.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ actor: ADMIN_EMAIL, action: 'tenant.create' })
    const row = await env.DB.prepare('SELECT created_by FROM tenants WHERE id = ?')
      .bind(body.tenant.id)
      .first<{ created_by: string }>()
    expect(row?.created_by).toBe(ADMIN_EMAIL)
  })

  it('50 文字は通り、51 文字は TOO_LONG', async () => {
    expect((await create('あ'.repeat(50))).res.status).toBe(201)
    const { res, body } = await create('あ'.repeat(51))
    expect(res.status).toBe(400)
    expect((body as unknown as ErrBody).error.fields).toEqual({ name: 'TOO_LONG' })
  })

  it('空の名前・不正な開催日は VALIDATION_ERROR と fields', async () => {
    for (const [name, eventDate, fields] of [
      ['   ', '2026-10-31', { name: 'REQUIRED' }],
      ['x', '2026-02-30', { eventDate: 'INVALID' }],
      ['x', '2026/10/31', { eventDate: 'INVALID' }],
      ['', '', { name: 'REQUIRED', eventDate: 'REQUIRED' }],
    ] as const) {
      const { res, body } = await create(name, eventDate)
      expect(res.status).toBe(400)
      expect((body as unknown as ErrBody).error.code).toBe('VALIDATION_ERROR')
      expect((body as unknown as ErrBody).error.fields).toEqual(fields)
    }
    const bad = await adminRequest('/api/tenants', { method: 'POST', body: [1] })
    expect(bad.status).toBe(400)
  })
})

describe('GET /api/tenants', () => {
  it('開催日の新しい順に、phase と stats つきで返す', async () => {
    const old = await createTenant(db, { name: 'old', eventDate: '2020-01-01', createdBy: 'x' })
    const future = await createTenant(db, {
      name: 'future',
      eventDate: '2099-12-31',
      createdBy: 'x',
    })
    const mid = await createTenant(db, { name: 'mid', eventDate: '2030-06-01', createdBy: 'x' })
    const guest = await createGuest(db, mid.id)
    await setGuestNickname(db, mid.id, guest.id, { nickname: 'taro', nicknameKey: 'taro' })
    const keys = photoKeys(mid.id, 'p1', 'image/jpeg')
    await insertPhotoWithLimit(
      db,
      mid.id,
      {
        id: 'p1',
        guestId: guest.id,
        originalKey: keys.original,
        displayKey: keys.display,
        thumbKey: keys.thumb,
        originalContentType: 'image/jpeg',
        storedSizeBytes: 1234,
        width: 10,
        height: 10,
      },
      100,
    )

    const res = await adminRequest('/api/tenants')
    expect(res.status).toBe(200)
    const { tenants } = (await res.json()) as { tenants: TenantBody['tenant'][] }
    expect(tenants.map((t) => t.id)).toEqual([future.id, mid.id, old.id])
    expect(tenants.map((t) => t.phase)).toEqual(['preparation', 'preparation', 'expired'])
    expect(tenants[1]?.stats).toEqual({
      guestCount: 1,
      photoCount: 1,
      likeCount: 0,
      storageBytes: 1234,
    })
  })

  it('認証が必要', async () => {
    expect((await request('/api/tenants')).status).toBe(401)
  })
})

describe('GET /api/tenants/:tenantId', () => {
  it('期間の境界が tenant-periods.md の計算例と一致する', async () => {
    const { body } = await create('x', '2026-10-31')
    const res = await adminRequest(`/api/tenants/${body.tenant.id}`)
    expect(res.status).toBe(200)
    expect(((await res.json()) as TenantBody).boundaries).toEqual({
      joiningStart: '2026-10-30T15:00:00.000Z',
      viewingStart: '2026-11-01T15:00:00.000Z',
      coupleOnlyStart: '2027-01-31T15:00:00.000Z',
      deletionAt: '2027-04-30T15:00:00.000Z',
    })
  })

  it('存在しないテナントは 404 TENANT_NOT_FOUND', async () => {
    const res = await adminRequest('/api/tenants/nope')
    expect(res.status).toBe(404)
    expect(((await res.json()) as ErrBody).error.code).toBe('TENANT_NOT_FOUND')
  })
})

describe('PATCH /api/tenants/:tenantId', () => {
  it('開催日を変えると期間が変わり、tenant.update に変更前後を残す', async () => {
    const { body } = await create('x', '2099-12-31')
    const id = body.tenant.id
    const res = await adminRequest(`/api/tenants/${id}`, {
      method: 'PATCH',
      body: { name: 'y', eventDate: '2020-01-01' },
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as TenantBody).tenant).toMatchObject({
      name: 'y',
      eventDate: '2020-01-01',
      phase: 'expired',
    })
    const logs = await audit(id)
    expect(logs.map((l) => l.action)).toEqual(['tenant.create', 'tenant.update'])
    expect(JSON.parse(logs[1]?.detail ?? 'null')).toEqual({
      before: { name: 'x', eventDate: '2099-12-31' },
      after: { name: 'y', eventDate: '2020-01-01' },
    })
  })

  it('停止・再開を記録する。変更のない PATCH は記録しない', async () => {
    const { body } = await create()
    const id = body.tenant.id
    const patch = (b: unknown) => adminRequest(`/api/tenants/${id}`, { method: 'PATCH', body: b })
    expect(((await (await patch({ suspended: true })).json()) as TenantBody).tenant.suspended).toBe(
      true,
    )
    await patch({ suspended: true })
    await patch({ suspended: false })
    expect((await audit(id)).map((l) => l.action)).toEqual([
      'tenant.create',
      'tenant.suspend',
      'tenant.resume',
    ])
  })

  it('不正な入力は VALIDATION_ERROR', async () => {
    const { body } = await create()
    const res = await adminRequest(`/api/tenants/${body.tenant.id}`, {
      method: 'PATCH',
      body: { name: '', eventDate: '2026-13-01', suspended: 'yes' },
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as ErrBody).error.fields).toEqual({
      name: 'REQUIRED',
      eventDate: 'INVALID',
      suspended: 'INVALID',
    })
  })

  it('存在しない・削除済みは TENANT_NOT_FOUND', async () => {
    const missing = await adminRequest('/api/tenants/nope', {
      method: 'PATCH',
      body: { name: 'a' },
    })
    expect(missing.status).toBe(404)
    const { body } = await create('gone')
    await adminRequest(`/api/tenants/${body.tenant.id}/deletion`, {
      method: 'POST',
      body: { confirmName: 'gone' },
    })
    const res = await adminRequest(`/api/tenants/${body.tenant.id}`, {
      method: 'PATCH',
      body: { name: 'a' },
    })
    expect(res.status).toBe(404)
    expect(((await res.json()) as ErrBody).error.code).toBe('TENANT_NOT_FOUND')
  })
})

describe('POST /api/tenants/:tenantId/deletion', () => {
  it('名前が一致しなければ CONFIRMATION_MISMATCH で何も消さない', async () => {
    const { body } = await create('正しい名前')
    const id = body.tenant.id
    await env.BUCKET.put(`tenants/${id}/a.txt`, 'a')
    const res = await adminRequest(`/api/tenants/${id}/deletion`, {
      method: 'POST',
      body: { confirmName: '違う名前' },
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as ErrBody).error.code).toBe('CONFIRMATION_MISMATCH')
    expect(await env.BUCKET.head(`tenants/${id}/a.txt`)).not.toBeNull()
    expect((await audit(id)).map((l) => l.action)).toEqual(['tenant.create'])
  })

  it('204 で D1 と R2 から消え、tenants の行は残り、tenant.delete を記録する', async () => {
    const { body } = await create('消す')
    const id = body.tenant.id
    const other = await createTenant(db, { name: 'other', eventDate: '2030-01-01', createdBy: 'x' })
    const guest = await createGuest(db, id)
    await env.BUCKET.put(`tenants/${id}/photos/p/original.jpg`, 'a')
    await env.BUCKET.put(`tenants/${other.id}/keep.txt`, 'b')

    const res = await adminRequest(`/api/tenants/${id}/deletion`, {
      method: 'POST',
      body: { confirmName: '消す' },
    })
    expect(res.status).toBe(204)
    expect(await env.BUCKET.head(`tenants/${id}/photos/p/original.jpg`)).toBeNull()
    expect(await env.BUCKET.head(`tenants/${other.id}/keep.txt`)).not.toBeNull()
    const g = await env.DB.prepare('SELECT COUNT(*) AS n FROM guests WHERE id = ?')
      .bind(guest.id)
      .first<{ n: number }>()
    expect(g?.n).toBe(0)
    const detail = await adminRequest(`/api/tenants/${id}`)
    expect(((await detail.json()) as TenantBody).tenant.dataDeletedAt).not.toBeNull()
    expect((await audit(id)).map((l) => [l.actor, l.action])).toEqual([
      [ADMIN_EMAIL, 'tenant.create'],
      [ADMIN_EMAIL, 'tenant.delete'],
    ])

    // 削除済みへの再削除は TENANT_NOT_FOUND
    const again = await adminRequest(`/api/tenants/${id}/deletion`, {
      method: 'POST',
      body: { confirmName: '消す' },
    })
    expect(again.status).toBe(404)
  })
})
