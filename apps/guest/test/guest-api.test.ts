import { env } from 'cloudflare:workers'
import {
  addCourseMenuImage,
  courseMenuImageKey,
  newId,
  seatingChartKey,
  upsertSeatingChart,
} from '@wym/db'
import { describe, expect, it } from 'vitest'
import { db, EVENT, errorCode, makeGuestSession, makeTenant, request } from './helpers'

describe('参加者向け API の共通処理', () => {
  it('セッションがなければ UNAUTHENTICATED', async () => {
    const tenant = await makeTenant()
    const res = await request(`/api/t/${tenant.id}/me`)
    expect(res.status).toBe(401)
    expect(await errorCode(res)).toBe('UNAUTHENTICATED')
  })

  it('他テナントの Cookie しかなければ UNAUTHENTICATED（A のセッションで B の API）', async () => {
    const tenantA = await makeTenant()
    const tenantB = await makeTenant()
    const a = await makeGuestSession(tenantA.id, 'たろう')
    // A のセッション ID を B の Cookie 名で送っても通らない
    const forged = `wym_g_${tenantB.id}=${a.sessionId}`
    for (const cookie of [a.cookie, forged]) {
      const res = await request(`/api/t/${tenantB.id}/me`, { cookie })
      expect(res.status).toBe(401)
      expect(await errorCode(res)).toBe('UNAUTHENTICATED')
    }
    const own = await request(`/api/t/${tenantA.id}/me`, { cookie: a.cookie })
    expect(own.status).toBe(200)
  })

  it('停止中は TENANT_SUSPENDED', async () => {
    const tenant = await makeTenant(EVENT.joining, { suspended: true })
    const { cookie } = await makeGuestSession(tenant.id, 'たろう')
    const res = await request(`/api/t/${tenant.id}/me`, { cookie })
    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('TENANT_SUSPENDED')
  })

  it('閲覧期間の後は PERIOD_ENDED', async () => {
    const tenant = await makeTenant(EVENT.coupleOnly)
    const { cookie } = await makeGuestSession(tenant.id, 'たろう')
    const res = await request(`/api/t/${tenant.id}/me`, { cookie })
    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('PERIOD_ENDED')
  })

  it('閲覧期間中は使える', async () => {
    const tenant = await makeTenant(EVENT.viewing)
    const { cookie } = await makeGuestSession(tenant.id, 'たろう')
    expect((await request(`/api/t/${tenant.id}/me`, { cookie })).status).toBe(200)
  })

  it('データ削除済みのテナントは TENANT_NOT_FOUND', async () => {
    const tenant = await makeTenant()
    const { cookie } = await makeGuestSession(tenant.id, 'たろう')
    await env.DB.prepare('UPDATE tenants SET data_deleted_at = ? WHERE id = ?')
      .bind(Date.now(), tenant.id)
      .run()
    const res = await request(`/api/t/${tenant.id}/me`, { cookie })
    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('TENANT_NOT_FOUND')
  })

  it('ニックネーム未登録だと me 系以外は NICKNAME_REQUIRED', async () => {
    const tenant = await makeTenant()
    const { cookie } = await makeGuestSession(tenant.id)
    expect((await request(`/api/t/${tenant.id}/me`, { cookie })).status).toBe(200)
    for (const path of ['/seating-chart', '/course-menu']) {
      const res = await request(`/api/t/${tenant.id}${path}`, { cookie })
      expect(res.status).toBe(403)
      expect(await errorCode(res)).toBe('NICKNAME_REQUIRED')
    }
  })

  it('CSRF: Origin がない・別オリジンの変更リクエストは FORBIDDEN', async () => {
    const tenant = await makeTenant()
    const { cookie } = await makeGuestSession(tenant.id)
    const json = { nickname: 'たろう', agreeToTerms: true }
    for (const origin of [null, 'https://evil.example.com', 'http://would-you-marry.me']) {
      const res = await request(`/api/t/${tenant.id}/me/nickname`, {
        method: 'PUT',
        cookie,
        origin,
        json,
      })
      expect(res.status).toBe(403)
      expect(await errorCode(res)).toBe('FORBIDDEN')
    }
    // 拒否されたので登録されていない
    const me = await request(`/api/t/${tenant.id}/me`, { cookie })
    expect((await me.json<{ me: { nickname: string | null } }>()).me.nickname).toBeNull()
  })

  it('last_seen_at は 10 分以内なら更新しない', async () => {
    const tenant = await makeTenant()
    const { cookie, guest } = await makeGuestSession(tenant.id, 'たろう')
    await request(`/api/t/${tenant.id}/me`, { cookie })
    const row = await env.DB.prepare('SELECT last_seen_at FROM guests WHERE id = ?')
      .bind(guest.id)
      .first<{ last_seen_at: number }>()
    expect(row?.last_seen_at).toBe(guest.lastSeenAt)
  })
})

describe('GET /me', () => {
  it('テナントと自分の情報を返す', async () => {
    const tenant = await makeTenant(EVENT.joining)
    const { cookie, guest } = await makeGuestSession(tenant.id, 'たろう')
    const res = await request(`/api/t/${tenant.id}/me`, { cookie })
    expect(await res.json()).toEqual({
      tenant: { id: tenant.id, name: tenant.name, eventDate: tenant.eventDate, phase: 'joining' },
      me: { id: guest.id, nickname: 'たろう', termsAgreed: false, photoCount: 0, photoLimit: 100 },
    })
  })
})

describe('PUT /me/nickname', () => {
  const put = (tenantId: string, cookie: string, json: unknown) =>
    request(`/api/t/${tenantId}/me/nickname`, { method: 'PUT', cookie, json })

  it('初回は同意つきで登録でき、同意日時が記録される', async () => {
    const tenant = await makeTenant()
    const { cookie, guest } = await makeGuestSession(tenant.id)
    const res = await put(tenant.id, cookie, { nickname: '  たろう  ', agreeToTerms: true })
    expect(res.status).toBe(200)
    const body = await res.json<{ me: { nickname: string; termsAgreed: boolean } }>()
    expect(body.me.nickname).toBe('たろう')
    expect(body.me.termsAgreed).toBe(true)
    const row = await env.DB.prepare('SELECT terms_agreed_at FROM guests WHERE id = ?')
      .bind(guest.id)
      .first<{ terms_agreed_at: number | null }>()
    expect(row?.terms_agreed_at).not.toBeNull()
  })

  it('変更は同意なしでできる', async () => {
    const tenant = await makeTenant()
    const { cookie } = await makeGuestSession(tenant.id)
    await put(tenant.id, cookie, { nickname: 'たろう', agreeToTerms: true })
    const res = await put(tenant.id, cookie, { nickname: 'じろう' })
    expect(res.status).toBe(200)
    expect((await res.json<{ me: { nickname: string } }>()).me.nickname).toBe('じろう')
  })

  it('初回に同意がなければ TERMS_NOT_AGREED で、登録されない', async () => {
    const tenant = await makeTenant()
    const { cookie } = await makeGuestSession(tenant.id)
    for (const json of [{ nickname: 'たろう' }, { nickname: 'たろう', agreeToTerms: false }]) {
      const res = await put(tenant.id, cookie, json)
      expect(res.status).toBe(400)
      expect(await errorCode(res)).toBe('TERMS_NOT_AGREED')
    }
    const me = await request(`/api/t/${tenant.id}/me`, { cookie })
    expect((await me.json<{ me: { nickname: string | null } }>()).me.nickname).toBeNull()
  })

  it('空・空白だけは REQUIRED、21 文字は TOO_LONG', async () => {
    const tenant = await makeTenant()
    const { cookie } = await makeGuestSession(tenant.id)
    const cases: [unknown, string][] = [
      [{ nickname: '', agreeToTerms: true }, 'REQUIRED'],
      [{ nickname: '   ', agreeToTerms: true }, 'REQUIRED'],
      [{ agreeToTerms: true }, 'REQUIRED'],
      [{ nickname: 'あ'.repeat(21), agreeToTerms: true }, 'TOO_LONG'],
    ]
    for (const [json, field] of cases) {
      const res = await put(tenant.id, cookie, json)
      expect(res.status).toBe(400)
      const body = await res.json<{ error: { code: string; fields: Record<string, string> } }>()
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.fields).toEqual({ nickname: field })
    }
    const ok = await put(tenant.id, cookie, { nickname: 'あ'.repeat(20), agreeToTerms: true })
    expect(ok.status).toBe(200)
  })

  it('本文が JSON でなくても VALIDATION_ERROR', async () => {
    const tenant = await makeTenant()
    const { cookie } = await makeGuestSession(tenant.id)
    const res = await request(`/api/t/${tenant.id}/me/nickname`, {
      method: 'PUT',
      cookie,
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(400)
    expect(await errorCode(res)).toBe('VALIDATION_ERROR')
  })

  it('同じテナントで使用中なら NICKNAME_TAKEN、別テナントの同名は可', async () => {
    const tenantA = await makeTenant()
    const tenantB = await makeTenant()
    const first = await makeGuestSession(tenantA.id, 'たろう')
    expect(first.guest.nickname).toBe('たろう')
    const second = await makeGuestSession(tenantA.id)
    const taken = await put(tenantA.id, second.cookie, { nickname: ' たろう ', agreeToTerms: true })
    expect(taken.status).toBe(409)
    expect(await errorCode(taken)).toBe('NICKNAME_TAKEN')

    const other = await makeGuestSession(tenantB.id)
    const ok = await put(tenantB.id, other.cookie, { nickname: 'たろう', agreeToTerms: true })
    expect(ok.status).toBe(200)
  })
})

async function putPdf(tenantId: string, content: string) {
  const key = seatingChartKey(tenantId, newId())
  await env.BUCKET.put(key, content, { httpMetadata: { contentType: 'application/pdf' } })
  await upsertSeatingChart(db, tenantId, {
    r2Key: key,
    sizeBytes: content.length,
  })
}

describe('席次表', () => {
  it('未登録は NOT_FOUND', async () => {
    const tenant = await makeTenant()
    const { cookie } = await makeGuestSession(tenant.id, 'たろう')
    const res = await request(`/api/t/${tenant.id}/seating-chart`, { cookie })
    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('NOT_FOUND')
  })

  it('登録済みなら PDF を返し、ETag で 304 になる', async () => {
    const tenant = await makeTenant()
    const { cookie } = await makeGuestSession(tenant.id, 'たろう')
    await putPdf(tenant.id, '%PDF-1.4 test')

    const res = await request(`/api/t/${tenant.id}/seating-chart`, { cookie })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
    expect(await res.text()).toBe('%PDF-1.4 test')
    const etag = res.headers.get('etag')
    expect(etag).toBeTruthy()

    const cached = await request(`/api/t/${tenant.id}/seating-chart`, {
      cookie,
      headers: { 'If-None-Match': etag ?? '' },
    })
    expect(cached.status).toBe(304)
    expect(cached.headers.get('cache-control')).toBe('private, no-cache')

    // 差し替えると ETag が変わり、200 で新しい中身を返す
    await putPdf(tenant.id, '%PDF-1.4 replaced')
    const replaced = await request(`/api/t/${tenant.id}/seating-chart`, {
      cookie,
      headers: { 'If-None-Match': etag ?? '' },
    })
    expect(replaced.status).toBe(200)
    expect(await replaced.text()).toBe('%PDF-1.4 replaced')
  })

  it('他テナントの席次表は見えない', async () => {
    const tenantA = await makeTenant()
    const tenantB = await makeTenant()
    await putPdf(tenantA.id, '%PDF A')
    const { cookie } = await makeGuestSession(tenantB.id, 'たろう')
    const res = await request(`/api/t/${tenantB.id}/seating-chart`, { cookie })
    expect(res.status).toBe(404)
  })
})

describe('コース表', () => {
  async function addImage(tenantId: string, content: string) {
    const id = newId()
    const key = courseMenuImageKey(tenantId, id, 'image/png')
    await env.BUCKET.put(key, content)
    await addCourseMenuImage(db, tenantId, {
      id,
      r2Key: key,
      contentType: 'image/png',
      sizeBytes: content.length,
    })
    return id
  }

  it('未登録は空の一覧', async () => {
    const tenant = await makeTenant()
    const { cookie } = await makeGuestSession(tenant.id, 'たろう')
    const res = await request(`/api/t/${tenant.id}/course-menu`, { cookie })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ images: [] })
  })

  it('登録順に一覧され、画像を長期キャッシュつきで取得できる', async () => {
    const tenant = await makeTenant()
    const { cookie } = await makeGuestSession(tenant.id, 'たろう')
    const first = await addImage(tenant.id, 'image-1')
    const second = await addImage(tenant.id, 'image-2')

    const list = await request(`/api/t/${tenant.id}/course-menu`, { cookie })
    expect(await list.json()).toEqual({
      images: [
        { id: first, url: `/api/t/${tenant.id}/course-menu/images/${first}` },
        { id: second, url: `/api/t/${tenant.id}/course-menu/images/${second}` },
      ],
    })

    const img = await request(`/api/t/${tenant.id}/course-menu/images/${first}`, { cookie })
    expect(img.status).toBe(200)
    expect(img.headers.get('content-type')).toBe('image/png')
    expect(img.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    expect(await img.text()).toBe('image-1')
  })

  it('他テナントの画像 ID は NOT_FOUND', async () => {
    const tenantA = await makeTenant()
    const tenantB = await makeTenant()
    const imageOfA = await addImage(tenantA.id, 'secret')
    const { cookie } = await makeGuestSession(tenantB.id, 'たろう')
    const res = await request(`/api/t/${tenantB.id}/course-menu/images/${imageOfA}`, { cookie })
    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('NOT_FOUND')
    const list = await request(`/api/t/${tenantB.id}/course-menu`, { cookie })
    expect(await list.json()).toEqual({ images: [] })
  })
})

describe('GET /api/config', () => {
  it('認証なしで問い合わせ先を返す', async () => {
    const res = await request('/api/config')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ contactEmail: env.CONTACT_EMAIL })
  })
})
