import { describe, expect, it } from 'vitest'
import {
  EVENT,
  makeCoupleAccess,
  makeCoupleSession,
  makeTenant,
  parseSetCookie,
  request,
} from './helpers'

const SECURITY_HEADERS = {
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
}

function expectSecurityHeaders(res: Response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    expect(res.headers.get(name), name).toBe(value)
  }
}

describe('GET /couple/:tenantId', () => {
  it('有効なトークンなら pending Cookie を設定してログイン画面へ（トークンは URL から消える）', async () => {
    const tenant = await makeTenant(EVENT.joining)
    const { token } = await makeCoupleAccess(tenant.id)

    const res = await request(`/couple/${tenant.id}?t=${token}`)

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`/couple/${tenant.id}/login`)
    const cookie = parseSetCookie(res)
    expect(cookie.name).toBe('wym_couple_pending')
    expect(cookie.value).toBe(token)
    expect(cookie.attrs).toContain('HttpOnly')
    expect(cookie.attrs).toContain('Secure')
    expect(cookie.attrs).toContain('SameSite=Lax')
    expect(cookie.attrs).toContain('Path=/api/couple')
    expect(cookie.attrs).toContain('Max-Age=900')
    expect(cookie.attrs.some((a) => a.toLowerCase().startsWith('domain'))).toBe(false)
  })

  it('準備期間でも入れる（新郎新婦はいつでも使える）', async () => {
    const tenant = await makeTenant(EVENT.preparation)
    const { token } = await makeCoupleAccess(tenant.id)
    const res = await request(`/couple/${tenant.id}?t=${token}`)
    expect(res.headers.get('location')).toBe(`/couple/${tenant.id}/login`)
  })

  it('有効な新郎新婦セッションがあれば写真一覧へ', async () => {
    const tenant = await makeTenant()
    const { access } = await makeCoupleAccess(tenant.id)
    const { cookie } = await makeCoupleSession(tenant.id, access.id)
    const res = await request(`/couple/${tenant.id}`, { cookie })
    expect(res.headers.get('location')).toBe(`/couple/${tenant.id}/photos`)
  })

  it('再発行で無効になったセッションは使えない', async () => {
    const tenant = await makeTenant()
    const { access } = await makeCoupleAccess(tenant.id)
    const { cookie } = await makeCoupleSession(tenant.id, access.id)
    const reissued = await makeCoupleAccess(tenant.id)
    // 古いセッションでは写真一覧に進めず、トークンもないので UNAUTHENTICATED
    const res = await request(`/couple/${tenant.id}`, { cookie })
    expect(res.headers.get('location')).toBe('/error?code=UNAUTHENTICATED&audience=couple')
    // 新しいトークンなら入場の手続きに進める
    const ok = await request(`/couple/${tenant.id}?t=${reissued.token}`, { cookie })
    expect(ok.headers.get('location')).toBe(`/couple/${tenant.id}/login`)
  })

  describe('エラーは audience=couple つきで /error へ', () => {
    async function expectError(res: Response, code: string) {
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe(`/error?code=${code}&audience=couple`)
      expect(res.headers.get('set-cookie')).toBeNull()
    }

    it('無効なトークン', async () => {
      const tenant = await makeTenant()
      await makeCoupleAccess(tenant.id)
      await expectError(await request(`/couple/${tenant.id}?t=wrong`), 'COUPLE_LINK_INVALID')
    })

    it('再発行で無効になった古いトークン', async () => {
      const tenant = await makeTenant()
      const old = await makeCoupleAccess(tenant.id)
      await makeCoupleAccess(tenant.id)
      await expectError(await request(`/couple/${tenant.id}?t=${old.token}`), 'COUPLE_LINK_INVALID')
    })

    it('他テナントのトークン', async () => {
      const tenantA = await makeTenant()
      const tenantB = await makeTenant()
      const a = await makeCoupleAccess(tenantA.id)
      await makeCoupleAccess(tenantB.id)
      await expectError(await request(`/couple/${tenantB.id}?t=${a.token}`), 'COUPLE_LINK_INVALID')
    })

    it('トークンもセッションもない', async () => {
      const tenant = await makeTenant()
      await expectError(await request(`/couple/${tenant.id}`), 'UNAUTHENTICATED')
    })

    it('停止中・期間外（削除対象）・存在しない・UUID でない', async () => {
      const suspended = await makeTenant(EVENT.joining, { suspended: true })
      const s = await makeCoupleAccess(suspended.id)
      await expectError(await request(`/couple/${suspended.id}?t=${s.token}`), 'TENANT_SUSPENDED')

      const expired = await makeTenant(EVENT.expired)
      const e = await makeCoupleAccess(expired.id)
      await expectError(await request(`/couple/${expired.id}?t=${e.token}`), 'PERIOD_ENDED')

      await expectError(
        await request('/couple/00000000-0000-4000-8000-000000000000?t=x'),
        'TENANT_NOT_FOUND',
      )
      await expectError(await request('/couple/not-a-uuid?t=x'), 'TENANT_NOT_FOUND')
    })
  })
})

describe('セキュリティ関係のヘッダー', () => {
  it('API・リダイレクト・エラーのすべてに付く', async () => {
    const tenant = await makeTenant()
    const responses = [
      await request('/api/config'),
      await request('/api/does-not-exist'),
      await request(`/api/t/${tenant.id}/me`),
      await request('/join/not-a-uuid'),
      await request(`/couple/${tenant.id}`),
      await request(`/api/t/${tenant.id}/me/nickname`, { method: 'PUT', origin: null }),
    ]
    for (const res of responses) expectSecurityHeaders(res)
  })

  it('SPA（静的アセット）のレスポンスにも付く', async () => {
    const tenant = await makeTenant()
    const res = await request(`/couple/${tenant.id}/login`)
    expectSecurityHeaders(res)
  })
})
