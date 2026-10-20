import { env } from 'cloudflare:workers'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createDb } from '../src'

describe('D1 のスモークテスト', () => {
  it('D1 バインディングに SQL を実行できる', async () => {
    const result = await env.DB.prepare('SELECT 1 AS one').first<{ one: number }>()
    expect(result?.one).toBe(1)
  })

  it('Drizzle のクライアントから D1 に問い合わせできる', async () => {
    const db = createDb(env.DB)
    const rows = await db.all<{ one: number }>(sql`SELECT 1 AS one`)
    expect(rows).toEqual([{ one: 1 }])
  })
})
