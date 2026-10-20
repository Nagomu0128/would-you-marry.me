import { createExecutionContext, createScheduledController } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { createGuest, createTenant } from '@wym/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/worker'
import { deleteExpiredTenants } from '../src/worker/jobs/delete-expired-tenants'
import { db, resetStorage, testEnv } from './helpers'

beforeEach(resetStorage)

async function tenantState(id: string) {
  return env.DB.prepare('SELECT data_deleted_at AS d FROM tenants WHERE id = ?')
    .bind(id)
    .first<{ d: number | null }>()
}

async function auditActions(id: string) {
  const { results } = await env.DB.prepare(
    'SELECT actor, action FROM audit_logs WHERE tenant_id = ?',
  )
    .bind(id)
    .all<{ actor: string; action: string }>()
  return results
}

describe('定期処理', () => {
  it('期限を過ぎたテナントだけを削除し、2 回実行しても問題ない', async () => {
    // 2026-10-31 の削除は 2027-04-30T15:00:00Z
    const expired = await createTenant(db, { name: 'e', eventDate: '2026-10-31', createdBy: 'x' })
    const justBefore = await createTenant(db, {
      name: 'j',
      eventDate: '2026-11-30',
      createdBy: 'x',
    })
    const future = await createTenant(db, { name: 'f', eventDate: '2099-01-01', createdBy: 'x' })
    await createGuest(db, expired.id)
    await env.BUCKET.put(`tenants/${expired.id}/a`, 'a')
    await env.BUCKET.put(`tenants/${future.id}/a`, 'a')

    const now = new Date('2027-04-30T15:00:00.000Z')
    expect(await deleteExpiredTenants(env, now)).toEqual({ deleted: 1, failed: 0 })
    expect((await tenantState(expired.id))?.d).not.toBeNull()
    expect((await tenantState(justBefore.id))?.d).toBeNull()
    expect((await tenantState(future.id))?.d).toBeNull()
    expect(await env.BUCKET.head(`tenants/${expired.id}/a`)).toBeNull()
    expect(await env.BUCKET.head(`tenants/${future.id}/a`)).not.toBeNull()
    expect(await auditActions(expired.id)).toEqual([{ actor: 'system', action: 'tenant.delete' }])

    // 1 ミリ秒前では削除されない
    const early = await createTenant(db, { name: 'z', eventDate: '2026-10-31', createdBy: 'x' })
    expect(await deleteExpiredTenants(env, new Date('2027-04-30T14:59:59.999Z'))).toEqual({
      deleted: 0,
      failed: 0,
    })
    expect((await tenantState(early.id))?.d).toBeNull()

    // 2 回目: 削除済みは対象外。監査ログも増えない
    expect(await deleteExpiredTenants(env, now)).toEqual({ deleted: 1, failed: 0 }) // early が対象
    expect(await deleteExpiredTenants(env, now)).toEqual({ deleted: 0, failed: 0 })
    expect(await auditActions(expired.id)).toHaveLength(1)
  })

  it('1 件の失敗で全体を止めず、失敗したテナントは次回やり直せる', async () => {
    const a = await createTenant(db, { name: 'a', eventDate: '2020-01-01', createdBy: 'x' })
    const b = await createTenant(db, { name: 'b', eventDate: '2020-02-01', createdBy: 'x' })
    const realList = env.BUCKET.list.bind(env.BUCKET)
    const failing = {
      ...env,
      BUCKET: Object.assign(Object.create(env.BUCKET), {
        list: (opts: R2ListOptions) => {
          if (opts.prefix === `tenants/${a.id}/`) throw new Error('r2 down')
          return realList(opts)
        },
      }),
    } as typeof env
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await deleteExpiredTenants(failing, new Date())).toEqual({ deleted: 1, failed: 1 })
    expect((await tenantState(a.id))?.d).toBeNull()
    expect((await tenantState(b.id))?.d).not.toBeNull()

    expect(await deleteExpiredTenants(env, new Date())).toEqual({ deleted: 1, failed: 0 })
    expect((await tenantState(a.id))?.d).not.toBeNull()
  })

  it('scheduled ハンドラーから実行される', async () => {
    const t = await createTenant(db, { name: 'a', eventDate: '2020-01-01', createdBy: 'x' })
    await worker.scheduled?.(
      createScheduledController({ cron: '0 18 * * *' }),
      testEnv(),
      createExecutionContext(),
    )
    expect((await tenantState(t.id))?.d).not.toBeNull()
  })
})
