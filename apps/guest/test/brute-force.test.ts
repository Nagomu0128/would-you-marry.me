// パスコードの総当たり対策（auth.md「5 回失敗で 15 分ロック」）を、並行して送った場合でも確かめる
// 注: テストの実行環境ではリクエストがほぼ直列に処理されるため、競合そのものの再現は
// packages/db/test/access.test.ts（reserveCoupleAttempt の同時実行）で確かめている。ここでは入口からの振る舞いを確かめる
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { makeCoupleAccess, makeTenant, PASSCODE, request } from './helpers'

const login = (tenantId: string, pending: string, passcode: string) =>
  request(`/api/couple/${tenantId}/login`, {
    method: 'POST',
    cookie: `wym_couple_pending=${pending}`,
    json: { passcode, agreeToTerms: true },
  })

async function lockRow(accessId: string) {
  return env.DB.prepare('SELECT locked_until, failed_attempts FROM couple_accesses WHERE id = ?')
    .bind(accessId)
    .first<{ locked_until: number | null; failed_attempts: number }>()
}

describe('パスコードの並行した総当たり', () => {
  it('同時に大量に送っても、照合まで進めるのは 5 回まで（残りはロックで断られる）', async () => {
    const tenant = await makeTenant()
    const { token } = await makeCoupleAccess(tenant.id)

    const responses = await Promise.all(
      Array.from({ length: 30 }, () => login(tenant.id, token, 'ZZZZ9999')),
    )
    const codes = await Promise.all(
      responses.map(async (res) => (await res.json<{ error: { code: string } }>()).error.code),
    )
    // 照合されて「違う」と返されたもの（PASSCODE_INVALID）は 4 回まで。5 回目がロックを確定させる
    expect(codes.filter((code) => code === 'PASSCODE_INVALID').length).toBeLessThanOrEqual(4)
    expect(codes.filter((code) => code === 'PASSCODE_LOCKED').length).toBeGreaterThanOrEqual(26)
    expect(codes.every((code) => code === 'PASSCODE_INVALID' || code === 'PASSCODE_LOCKED')).toBe(
      true,
    )
  })

  it('ロックされた後に同時に送った正しいパスコードは通らない', async () => {
    const tenant = await makeTenant()
    const { token } = await makeCoupleAccess(tenant.id)

    for (let i = 0; i < 5; i++) await login(tenant.id, token, 'ZZZZ9999')
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => login(tenant.id, token, PASSCODE)),
    )
    expect(responses.map((res) => res.status)).toEqual(Array(10).fill(429))
    const sessionCookies = responses.flatMap((res) =>
      res.headers.getSetCookie().filter((c) => c.startsWith('wym_c_')),
    )
    expect(sessionCookies).toEqual([])
  })

  it('ロック中の追加の失敗は、失敗回数もロックの期限も変えない', async () => {
    const tenant = await makeTenant()
    const { token, access } = await makeCoupleAccess(tenant.id)
    for (let i = 0; i < 5; i++) await login(tenant.id, token, 'ZZZZ9999')
    const before = await lockRow(access.id)
    expect(before?.locked_until).not.toBeNull()

    await Promise.all(Array.from({ length: 10 }, () => login(tenant.id, token, 'ZZZZ9999')))
    expect(await lockRow(access.id)).toEqual(before)
  })
})
