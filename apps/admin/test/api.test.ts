import { exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { adminRequest, resetStorage } from './helpers'

beforeEach(resetStorage)

describe('admin Worker', () => {
  it('/api/ の存在しないパスは、管理者なら 404 の NOT_FOUND を JSON で返す', async () => {
    const res = await adminRequest('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'not found' } })
  })

  it('/api/ は認証なしなら 401（Worker のエントリーポイント経由）', async () => {
    const res = await exports.default.fetch('https://admin.would-you-marry.me/api/does-not-exist')
    expect(res.status).toBe(401)
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
  })
})
