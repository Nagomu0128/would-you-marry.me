import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

describe('guest Worker', () => {
  it('/api/ の存在しないパスは 404 の NOT_FOUND を JSON で返す', async () => {
    const res = await exports.default.fetch('https://would-you-marry.me/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'not found' } })
  })

  it('POST でも同じ形式の 404 を返す', async () => {
    const res = await exports.default.fetch('https://would-you-marry.me/api/nope', {
      method: 'POST',
      headers: { Origin: 'https://would-you-marry.me' },
    })
    expect(res.status).toBe(404)
    const body = await res.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('NOT_FOUND')
  })
})
