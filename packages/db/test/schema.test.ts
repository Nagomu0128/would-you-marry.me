import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import {
  createVisitorSession,
  deletePhotoAsAdmin,
  findActiveJoinToken,
  issueJoinToken,
  likePhoto,
  newId,
} from '../src'
import { count, db, makeGuest, makePhoto, makeTenant } from './helpers'

describe('マイグレーションで作られたスキーマ', () => {
  it('部分ユニークインデックスで、有効なトークンはテナントに 1 つだけ', async () => {
    const tenant = await makeTenant()
    const insert = (token: string, revokedAt: number | null) =>
      env.DB.prepare(
        'INSERT INTO join_tokens (id, tenant_id, token, created_at, revoked_at) VALUES (?, ?, ?, 1, ?)',
      )
        .bind(newId(), tenant.id, token, revokedAt)
        .run()

    await insert('t1', null)
    // 有効なものが 2 つ目 → 拒否される
    await expect(insert('t2', null)).rejects.toThrow(/UNIQUE/)
    // 無効化済みのものはいくつあってもよい
    await insert('t3', 100)
    await insert('t4', 200)
    expect(await count('join_tokens', `tenant_id = '${tenant.id}'`)).toBe(3)
  })

  it('新郎新婦用トークンも有効なものはテナントに 1 つだけ', async () => {
    const tenant = await makeTenant()
    const insert = (token: string) =>
      env.DB.prepare(
        "INSERT INTO couple_accesses (id, tenant_id, token, passcode_hash, created_at) VALUES (?, ?, ?, 'h', 1)",
      )
        .bind(newId(), tenant.id, token)
        .run()
    await insert('c1')
    await expect(insert('c2')).rejects.toThrow(/UNIQUE/)
  })

  it('別テナントなら、それぞれ有効なトークンを持てる', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    await issueJoinToken(db, a.id, `tok-${newId()}`)
    await issueJoinToken(db, b.id, `tok-${newId()}`)
  })

  it('外部キーが効いている: 存在しないテナントの行は入れられない', async () => {
    await expect(
      env.DB.prepare(
        'INSERT INTO join_tokens (id, tenant_id, token, created_at) VALUES (?, ?, ?, 1)',
      )
        .bind(newId(), newId(), 'x')
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/)
  })

  it('写真を削除すると、いいねが CASCADE で消える', async () => {
    const tenant = await makeTenant()
    const guest = await makeGuest(tenant.id, 'たろう')
    const photo = await makePhoto(tenant.id, guest.id)
    await likePhoto(db, tenant.id, guest.id, photo.id)
    expect(await count('likes', `photo_id = '${photo.id}'`)).toBe(1)

    await deletePhotoAsAdmin(db, tenant.id, photo.id)
    expect(await count('likes', `photo_id = '${photo.id}'`)).toBe(0)
  })

  it('参加者を削除すると、写真・いいね・セッションが CASCADE で消える', async () => {
    const tenant = await makeTenant()
    const guest = await makeGuest(tenant.id, 'はなこ')
    const other = await makeGuest(tenant.id, 'じろう')
    const photo = await makePhoto(tenant.id, guest.id)
    const otherPhoto = await makePhoto(tenant.id, other.id)
    await likePhoto(db, tenant.id, other.id, photo.id)
    await likePhoto(db, tenant.id, guest.id, otherPhoto.id)
    await createVisitorSession(db, {
      idHash: newId(),
      tenantId: tenant.id,
      kind: 'guest',
      guestId: guest.id,
    })

    await env.DB.prepare('DELETE FROM guests WHERE id = ?').bind(guest.id).run()

    expect(await count('photos', `guest_id = '${guest.id}'`)).toBe(0)
    expect(await count('likes', `tenant_id = '${tenant.id}'`)).toBe(0)
    expect(await count('visitor_sessions', `guest_id = '${guest.id}'`)).toBe(0)
  })

  it('visitor_sessions.kind は guest / couple だけ（CHECK 制約）', async () => {
    const tenant = await makeTenant()
    await expect(
      env.DB.prepare(
        "INSERT INTO visitor_sessions (id_hash, tenant_id, kind, created_at, last_seen_at) VALUES (?, ?, 'admin', 1, 1)",
      )
        .bind(newId(), tenant.id)
        .run(),
    ).rejects.toThrow(/CHECK/)
  })

  it('Better Auth の表が作られている', async () => {
    for (const table of ['auth_user', 'auth_session', 'auth_account', 'auth_verification']) {
      expect(await count(table)).toBe(0)
    }
  })

  it('参加トークンの照合は有効なものだけ', async () => {
    const tenant = await makeTenant()
    await issueJoinToken(db, tenant.id, 'old-token')
    await issueJoinToken(db, tenant.id, 'new-token')
    expect(await findActiveJoinToken(db, tenant.id, 'old-token')).toBeUndefined()
    expect(await findActiveJoinToken(db, tenant.id, 'new-token')).toBeDefined()
  })
})
