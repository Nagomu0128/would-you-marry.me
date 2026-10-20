import { env } from 'cloudflare:workers'
import { COURSE_MENU_IMAGE_MAX_BYTES, SEATING_CHART_MAX_BYTES } from '@wym/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  adminRawRequest,
  auditRows,
  fakeJpeg,
  fakePdf,
  fakePng,
  imageForm,
  newTenant,
} from './fixtures'
import { ADMIN_EMAIL, adminRequest, resetStorage } from './helpers'

beforeEach(resetStorage)

type ErrBody = { error: { code: string; fields?: Record<string, string> } }

async function putPdf(tenantId: string, body: BodyInit, headers: Record<string, string> = {}) {
  return adminRawRequest(`/api/tenants/${tenantId}/seating-chart`, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': 'application/pdf', ...headers },
  })
}

async function allKeys() {
  return (await env.BUCKET.list()).objects.map((o) => o.key)
}

describe('席次表', () => {
  it('未登録なら GET・HEAD は 404 NOT_FOUND', async () => {
    const t = await newTenant()
    const res = await adminRequest(`/api/tenants/${t.id}/seating-chart`)
    expect(res.status).toBe(404)
    expect(((await res.json()) as ErrBody).error.code).toBe('NOT_FOUND')
    const head = await adminRawRequest(`/api/tenants/${t.id}/seating-chart`, { method: 'HEAD' })
    expect(head.status).toBe(404)
  })

  it('登録して取得できる。ETag・Cache-Control・304・HEAD', async () => {
    const t = await newTenant()
    const res = await putPdf(t.id, fakePdf(100))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { sizeBytes: number; uploadedAt: string }
    expect(body.sizeBytes).toBe(100)
    expect(new Date(body.uploadedAt).toISOString()).toBe(body.uploadedAt)

    const get = await adminRequest(`/api/tenants/${t.id}/seating-chart`)
    expect(get.status).toBe(200)
    expect(get.headers.get('Content-Type')).toBe('application/pdf')
    expect(get.headers.get('Cache-Control')).toBe('private, no-cache')
    expect((await get.arrayBuffer()).byteLength).toBe(100)
    const etag = get.headers.get('ETag')
    expect(etag).toBeTruthy()

    const cond = await adminRawRequest(`/api/tenants/${t.id}/seating-chart`, {
      method: 'GET',
      headers: { 'If-None-Match': etag ?? '' },
    })
    expect(cond.status).toBe(304)

    const head = await adminRawRequest(`/api/tenants/${t.id}/seating-chart`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('ETag')).toBe(etag)
    expect(head.headers.get('Content-Length')).toBe('100')
    expect((await head.arrayBuffer()).byteLength).toBe(0)

    const logs = await auditRows(t.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ actor: ADMIN_EMAIL, action: 'seating_chart.upload' })
  })

  it('差し替えると古いファイルが R2 から消え、ETag が変わる', async () => {
    const t = await newTenant()
    await putPdf(t.id, fakePdf(100))
    const first = await allKeys()
    expect(first).toHaveLength(1)
    const etag1 = (await adminRequest(`/api/tenants/${t.id}/seating-chart`)).headers.get('ETag')

    expect((await putPdf(t.id, fakePdf(200))).status).toBe(200)
    const second = await allKeys()
    expect(second).toHaveLength(1)
    expect(second[0]).not.toBe(first[0])
    const get = await adminRequest(`/api/tenants/${t.id}/seating-chart`)
    expect(get.headers.get('ETag')).not.toBe(etag1)
    expect((await get.arrayBuffer()).byteLength).toBe(200)
    expect((await auditRows(t.id)).map((r) => r.action)).toEqual([
      'seating_chart.upload',
      'seating_chart.upload',
    ])
  })

  it('PDF 以外は 415、保存しない', async () => {
    const t = await newTenant()
    const res = await putPdf(t.id, fakeJpeg())
    expect(res.status).toBe(415)
    expect(((await res.json()) as ErrBody).error.code).toBe('UNSUPPORTED_FILE_TYPE')
    expect((await putPdf(t.id, new Uint8Array(0))).status).toBe(415)
    expect(await allKeys()).toEqual([])
  })

  it('Content-Length が 20MB を超えるなら 413', async () => {
    const t = await newTenant()
    const res = await putPdf(t.id, fakePdf(100), {
      'Content-Length': String(SEATING_CHART_MAX_BYTES + 1),
    })
    expect(res.status).toBe(413)
    expect(((await res.json()) as ErrBody).error.code).toBe('FILE_TOO_LARGE')
    expect(await allKeys()).toEqual([])
  })

  it('20MB ちょうどは通り、20MB + 1 バイトは 413', async () => {
    const t = await newTenant()
    expect((await putPdf(t.id, fakePdf(SEATING_CHART_MAX_BYTES))).status).toBe(200)
    const res = await putPdf(t.id, fakePdf(SEATING_CHART_MAX_BYTES + 1))
    expect(res.status).toBe(413)
  })
})

describe('コース表', () => {
  async function add(tenantId: string, bytes: Uint8Array<ArrayBuffer>, name?: string) {
    return adminRawRequest(`/api/tenants/${tenantId}/course-menu/images`, {
      method: 'POST',
      body: imageForm(bytes, name),
    })
  }
  type Img = { id: string; url: string }

  it('追加（201）→ 一覧の順 → 画像の取得（ヘッダー）', async () => {
    const t = await newTenant()
    const r1 = await add(t.id, fakeJpeg(10))
    expect(r1.status).toBe(201)
    const { image: a } = (await r1.json()) as { image: Img }
    const { image: b } = (await (await add(t.id, fakePng(20), 'x.png')).json()) as { image: Img }
    expect(a.url).toBe(`/api/tenants/${t.id}/course-menu/images/${a.id}`)

    const list = (await (await adminRequest(`/api/tenants/${t.id}/course-menu`)).json()) as {
      images: Img[]
    }
    expect(list.images.map((i) => i.id)).toEqual([a.id, b.id])

    const img = await adminRequest(b.url)
    expect(img.status).toBe(200)
    expect(img.headers.get('Content-Type')).toBe('image/png')
    expect(img.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable')
    expect((await img.arrayBuffer()).byteLength).toBe(20)

    const logs = await auditRows(t.id)
    expect(logs.map((l) => l.action)).toEqual(['course_menu.add', 'course_menu.add'])
    expect(logs[0]?.targetId).toBe(a.id)
  })

  it('形式は先頭のバイトで判定する（拡張子は信用しない）', async () => {
    const t = await newTenant()
    const pdf = await add(t.id, fakePdf(), 'menu.jpg')
    expect(pdf.status).toBe(415)
    expect(((await pdf.json()) as ErrBody).error.code).toBe('UNSUPPORTED_FILE_TYPE')
    expect((await add(t.id, fakePng(), 'menu.pdf')).status).toBe(201)
  })

  it('10MB ちょうどは通り、超えると 413。file がなければ 400', async () => {
    const t = await newTenant()
    expect((await add(t.id, fakeJpeg(COURSE_MENU_IMAGE_MAX_BYTES))).status).toBe(201)
    const big = await add(t.id, fakeJpeg(COURSE_MENU_IMAGE_MAX_BYTES + 1))
    expect(big.status).toBe(413)
    expect(((await big.json()) as ErrBody).error.code).toBe('FILE_TOO_LARGE')

    const none = await adminRawRequest(`/api/tenants/${t.id}/course-menu/images`, {
      method: 'POST',
      body: new FormData(),
    })
    expect(none.status).toBe(400)
    expect(((await none.json()) as ErrBody).error.fields).toEqual({ file: 'REQUIRED' })
  })

  it('削除で R2 と D1 から消え、残りの順序が詰まる。ないものは 404', async () => {
    const t = await newTenant()
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      ids.push(((await (await add(t.id, fakeJpeg())).json()) as { image: Img }).image.id)
    }
    const del = await adminRequest(`/api/tenants/${t.id}/course-menu/images/${ids[1]}`, {
      method: 'DELETE',
    })
    expect(del.status).toBe(204)
    expect(await allKeys()).toHaveLength(2)
    const rows = await env.DB.prepare(
      'SELECT id, sort_order FROM course_menu_images ORDER BY sort_order',
    ).all<{ id: string; sort_order: number }>()
    expect(rows.results).toEqual([
      { id: ids[0], sort_order: 0 },
      { id: ids[2], sort_order: 1 },
    ])
    expect((await auditRows(t.id)).at(-1)).toMatchObject({
      action: 'course_menu.remove',
      targetId: ids[1],
    })

    const again = await adminRequest(`/api/tenants/${t.id}/course-menu/images/${ids[1]}`, {
      method: 'DELETE',
    })
    expect(again.status).toBe(404)
  })

  it('並べ替え。不足・余分・重複・不正な形は 400', async () => {
    const t = await newTenant()
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      ids.push(((await (await add(t.id, fakeJpeg())).json()) as { image: Img }).image.id)
    }
    const order = (body: unknown) =>
      adminRequest(`/api/tenants/${t.id}/course-menu/order`, { method: 'PUT', body })

    for (const bad of [
      { imageIds: [ids[0], ids[1]] },
      { imageIds: [...ids, crypto.randomUUID()] },
      { imageIds: [ids[0], ids[0], ids[1]] },
      { imageIds: [ids[0], ids[1], 'other'] },
      { imageIds: 'x' },
      { imageIds: [1, 2, 3] },
      {},
    ]) {
      const res = await order(bad)
      expect(res.status).toBe(400)
      expect(((await res.json()) as ErrBody).error.code).toBe('VALIDATION_ERROR')
    }

    const reversed = [ids[2], ids[0], ids[1]]
    expect((await order({ imageIds: reversed })).status).toBe(204)
    const list = (await (await adminRequest(`/api/tenants/${t.id}/course-menu`)).json()) as {
      images: Img[]
    }
    expect(list.images.map((i) => i.id)).toEqual(reversed)
    expect((await auditRows(t.id)).at(-1)?.action).toBe('course_menu.reorder')
  })
})
