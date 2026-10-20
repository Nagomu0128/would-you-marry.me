import { env } from 'cloudflare:workers'
import { deleteTenantData } from '@wym/db'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  adminRawRequest,
  fakeJpeg,
  fakePdf,
  imageForm,
  newGuest,
  newPhoto,
  newTenant,
} from './fixtures'
import { ADMIN_EMAIL, adminRequest, createSession, db, request, resetStorage } from './helpers'

beforeEach(resetStorage)

type ErrBody = { error: { code: string } }

async function code(res: Response): Promise<string> {
  return ((await res.json()) as ErrBody).error.code
}

describe('テナント分離', () => {
  it('テナント A のパスでテナント B の写真・コース表の画像・参加者を指定すると NOT_FOUND', async () => {
    const a = await newTenant()
    const b = await newTenant()
    const guestB = await newGuest(b.id, 'taro')
    const photoB = await newPhoto(b.id, guestB.id)
    const added = await adminRawRequest(`/api/tenants/${b.id}/course-menu/images`, {
      method: 'POST',
      body: imageForm(fakeJpeg()),
    })
    const imageB = ((await added.json()) as { image: { id: string } }).image.id

    const base = `/api/tenants/${a.id}`
    for (const kind of ['thumb', 'display', 'original']) {
      const res = await adminRequest(`${base}/photos/${photoB.id}/${kind}`)
      expect(res.status).toBe(404)
      expect(await code(res)).toBe('NOT_FOUND')
    }
    expect((await adminRequest(`${base}/course-menu/images/${imageB}`)).status).toBe(404)
    expect(
      (await adminRequest(`${base}/course-menu/images/${imageB}`, { method: 'DELETE' })).status,
    ).toBe(404)
    expect((await adminRequest(`${base}/photos/${photoB.id}`, { method: 'DELETE' })).status).toBe(
      404,
    )
    const rename = await adminRequest(`${base}/guests/${guestB.id}`, {
      method: 'PATCH',
      body: { nickname: 'x' },
    })
    expect(rename.status).toBe(404)
    // 並べ替えに他のテナントの ID を混ぜても受け付けない
    const order = await adminRequest(`${base}/course-menu/order`, {
      method: 'PUT',
      body: { imageIds: [imageB] },
    })
    expect(order.status).toBe(400)

    // B のものは何も変わっていない
    const photos = await env.DB.prepare('SELECT COUNT(*) AS n FROM photos').first<{ n: number }>()
    const images = await env.DB.prepare('SELECT COUNT(*) AS n FROM course_menu_images').first<{
      n: number
    }>()
    const guest = await env.DB.prepare('SELECT nickname FROM guests WHERE id = ?')
      .bind(guestB.id)
      .first<{ nickname: string }>()
    expect(photos?.n).toBe(1)
    expect(images?.n).toBe(1)
    expect(guest?.nickname).toBe('taro')
    expect((await env.BUCKET.list()).objects).toHaveLength(4)

    // A の一覧に B のものは出ない
    const list = (await (await adminRequest(`${base}/photos`)).json()) as { photos: unknown[] }
    expect(list.photos).toEqual([])
    const guests = (await (await adminRequest(`${base}/guests`)).json()) as { guests: unknown[] }
    expect(guests.guests).toEqual([])
  })

  it('テナントが UUID の形でない・ない・データ削除済みなら TENANT_NOT_FOUND', async () => {
    const deleted = await newTenant()
    await deleteTenantData(db, deleted.id)
    const ids = ['not-a-uuid', crypto.randomUUID(), deleted.id]
    const calls: [string, string, BodyInit | undefined][] = [
      ['GET', 'join-url', undefined],
      ['POST', 'join-url', undefined],
      ['GET', 'couple-access', undefined],
      ['POST', 'couple-access', undefined],
      ['GET', 'seating-chart', undefined],
      ['PUT', 'seating-chart', fakePdf()],
      ['GET', 'course-menu', undefined],
      ['POST', 'course-menu/images', imageForm(fakeJpeg())],
      ['PUT', 'course-menu/order', JSON.stringify({ imageIds: [] })],
      ['GET', 'photos', undefined],
      ['DELETE', `photos/${crypto.randomUUID()}`, undefined],
      ['GET', `photos/${crypto.randomUUID()}/thumb`, undefined],
      ['GET', 'guests', undefined],
      ['PATCH', `guests/${crypto.randomUUID()}`, JSON.stringify({ nickname: 'x' })],
    ]
    for (const id of ids) {
      for (const [method, path, body] of calls) {
        const res = await adminRawRequest(`/api/tenants/${id}/${path}`, { method, body })
        expect(res.status, `${method} ${path} ${id}`).toBe(404)
        expect(await code(res), `${method} ${path} ${id}`).toBe('TENANT_NOT_FOUND')
      }
    }
  })
})

describe('認可', () => {
  const paths: [string, string][] = [
    ['GET', 'join-url'],
    ['POST', 'couple-access'],
    ['GET', 'seating-chart'],
    ['GET', 'photos'],
    ['GET', 'guests'],
  ]

  it('セッションなしは 401', async () => {
    const t = await newTenant()
    for (const [method, path] of paths) {
      const res = await request(`/api/tenants/${t.id}/${path}`, { method })
      expect(res.status, `${method} ${path}`).toBe(401)
      expect(await code(res)).toBe('UNAUTHENTICATED')
    }
  })

  it('許可リスト外の管理者は 403 で、何も発行されない', async () => {
    const t = await newTenant()
    const outsider = await createSession('someone@example.com')
    expect(ADMIN_EMAIL).not.toBe('someone@example.com')
    for (const [method, path] of paths) {
      const res = await request(`/api/tenants/${t.id}/${path}`, { method, cookie: outsider.cookie })
      expect(res.status, `${method} ${path}`).toBe(403)
      expect(await code(res)).toBe('FORBIDDEN')
    }
    const tokens = await env.DB.prepare('SELECT COUNT(*) AS n FROM couple_accesses').first<{
      n: number
    }>()
    expect(tokens?.n).toBe(0)
  })

  it('状態を変える操作は Origin が違えば 403', async () => {
    const t = await newTenant()
    const session = await createSession()
    const res = await request(`/api/tenants/${t.id}/join-url`, {
      method: 'POST',
      cookie: session.cookie,
      origin: 'https://evil.example',
    })
    expect(res.status).toBe(403)
  })
})
