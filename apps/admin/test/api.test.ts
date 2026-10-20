import { createExecutionContext, createScheduledController } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import worker from '../src/worker'

describe('admin Worker', () => {
  it('/api/ の存在しないパスは 404 の NOT_FOUND を JSON で返す', async () => {
    const res = await exports.default.fetch('https://admin.would-you-marry.me/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'not found' } })
  })

  it('scheduled を呼び出せる', async () => {
    const ctx = createExecutionContext()
    await expect(
      worker.scheduled(createScheduledController({ cron: '0 18 * * *' }), env, ctx),
    ).resolves.toBeUndefined()
  })
})
