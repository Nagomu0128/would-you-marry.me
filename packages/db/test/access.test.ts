import { describe, expect, it } from 'vitest'
import {
  createVisitorSession,
  findActiveCoupleAccessByToken,
  findActiveJoinToken,
  getActiveCoupleAccess,
  getActiveJoinToken,
  getVisitorSession,
  issueCoupleAccess,
  issueJoinToken,
  newId,
  reserveCoupleAttempt,
  recordCoupleTermsAgreement,
  resetCoupleFailedAttempts,
  touchVisitorSession,
} from '../src'
import { count, db, makeGuest, makeTenant } from './helpers'

describe('join_tokens', () => {
  it('発行すると有効なトークンとして取得でき、再発行で古いものが無効になる', async () => {
    const tenant = await makeTenant()
    expect(await getActiveJoinToken(db, tenant.id)).toBeUndefined()

    const first = await issueJoinToken(db, tenant.id, 'tok-1', 100)
    expect(await getActiveJoinToken(db, tenant.id)).toEqual(first)

    const second = await issueJoinToken(db, tenant.id, 'tok-2', 200)
    expect(await getActiveJoinToken(db, tenant.id)).toEqual(second)
    // 古いものは revoked_at が付いて残る
    expect(await count('join_tokens', `token = 'tok-1' AND revoked_at = 200`)).toBe(1)
    expect(await count('join_tokens', `tenant_id = '${tenant.id}' AND revoked_at IS NULL`)).toBe(1)
  })

  it('他のテナントのトークンは取得・照合できない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    await issueJoinToken(db, a.id, 'tok-a')
    expect(await getActiveJoinToken(db, b.id)).toBeUndefined()
    expect(await findActiveJoinToken(db, b.id, 'tok-a')).toBeUndefined()
    expect(await findActiveJoinToken(db, a.id, 'tok-a')).toBeDefined()
  })

  it('再発行は他のテナントのトークンに影響しない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    await issueJoinToken(db, a.id, `a-${newId()}`)
    const tokenB = await issueJoinToken(db, b.id, `b-${newId()}`)
    await issueJoinToken(db, a.id, `a-${newId()}`)
    expect(await getActiveJoinToken(db, b.id)).toEqual(tokenB)
  })
})

describe('couple_accesses', () => {
  it('発行・再発行・照合', async () => {
    const tenant = await makeTenant()
    const other = await makeTenant()
    expect(await getActiveCoupleAccess(db, tenant.id)).toBeUndefined()

    const first = await issueCoupleAccess(
      db,
      tenant.id,
      { token: `c-${newId()}`, passcodeHash: 'h1' },
      100,
    )
    expect(first).toMatchObject({ failedAttempts: 0, lockedUntil: null, termsAgreedAt: null })
    expect(await findActiveCoupleAccessByToken(db, tenant.id, first.token)).toEqual(first)
    expect(await findActiveCoupleAccessByToken(db, other.id, first.token)).toBeUndefined()

    const second = await issueCoupleAccess(
      db,
      tenant.id,
      { token: `c-${newId()}`, passcodeHash: 'h2' },
      200,
    )
    expect(await getActiveCoupleAccess(db, tenant.id)).toEqual(second)
    expect(await findActiveCoupleAccessByToken(db, tenant.id, first.token)).toBeUndefined()
  })

  it('再発行すると、その新郎新婦のセッションが削除される（参加者のセッションは残る）', async () => {
    const tenant = await makeTenant()
    const first = await issueCoupleAccess(db, tenant.id, {
      token: `c-${newId()}`,
      passcodeHash: 'h',
    })
    const guest = await makeGuest(tenant.id, 'g')
    const coupleHash = newId()
    const guestHash = newId()
    await createVisitorSession(db, {
      idHash: coupleHash,
      tenantId: tenant.id,
      kind: 'couple',
      coupleAccessId: first.id,
    })
    await createVisitorSession(db, {
      idHash: guestHash,
      tenantId: tenant.id,
      kind: 'guest',
      guestId: guest.id,
    })

    await issueCoupleAccess(db, tenant.id, { token: `c-${newId()}`, passcodeHash: 'h' })

    expect(await getVisitorSession(db, tenant.id, coupleHash)).toBeUndefined()
    expect(await getVisitorSession(db, tenant.id, guestHash)).toBeDefined()
  })

  it('再発行は他のテナントの新郎新婦のセッションに影響しない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    await issueCoupleAccess(db, a.id, { token: `a-${newId()}`, passcodeHash: 'h' })
    const accessB = await issueCoupleAccess(db, b.id, { token: `b-${newId()}`, passcodeHash: 'h' })
    const hashB = newId()
    await createVisitorSession(db, {
      idHash: hashB,
      tenantId: b.id,
      kind: 'couple',
      coupleAccessId: accessB.id,
    })
    await issueCoupleAccess(db, a.id, { token: `a-${newId()}`, passcodeHash: 'h' })
    expect(await getVisitorSession(db, b.id, hashB)).toBeDefined()
  })

  it('失敗回数を加算し、上限でロックする。ロックしたら回数は 0 に戻る', async () => {
    const tenant = await makeTenant()
    const access = await issueCoupleAccess(db, tenant.id, {
      token: `c-${newId()}`,
      passcodeHash: 'h',
    })
    const opts = { maxAttempts: 5, lockMs: 15 * 60 * 1000 }
    const now = 1_000_000

    for (let i = 1; i <= 4; i++) {
      expect(await reserveCoupleAttempt(db, tenant.id, access.id, opts, now)).toEqual({
        ok: true,
        locked: false,
        lockedUntil: null,
        remainingAttempts: 5 - i,
      })
    }
    expect(await reserveCoupleAttempt(db, tenant.id, access.id, opts, now)).toEqual({
      ok: true,
      locked: true,
      lockedUntil: now + opts.lockMs,
      remainingAttempts: 0,
    })
    const after = await getActiveCoupleAccess(db, tenant.id)
    expect(after).toMatchObject({ failedAttempts: 0, lockedUntil: now + opts.lockMs })

    // ロックが明けたあとは、また 5 回試せる
    const later = now + opts.lockMs + 1
    expect(await reserveCoupleAttempt(db, tenant.id, access.id, opts, later)).toEqual({
      ok: true,
      locked: false,
      lockedUntil: null,
      remainingAttempts: 4,
    })
  })

  it('ロック中は予約できず、失敗回数もロックの期限も変わらない', async () => {
    const tenant = await makeTenant()
    const access = await issueCoupleAccess(db, tenant.id, {
      token: `c-${newId()}`,
      passcodeHash: 'h',
    })
    const opts = { maxAttempts: 2, lockMs: 1000 }
    await reserveCoupleAttempt(db, tenant.id, access.id, opts, 10)
    await reserveCoupleAttempt(db, tenant.id, access.id, opts, 10)
    const locked = await getActiveCoupleAccess(db, tenant.id)
    expect(locked?.lockedUntil).toBe(1010)

    expect(await reserveCoupleAttempt(db, tenant.id, access.id, opts, 500)).toEqual({
      ok: false,
      reason: 'locked',
      lockedUntil: 1010,
    })
    expect(await getActiveCoupleAccess(db, tenant.id)).toEqual(locked)
  })

  it('同時に予約しても、ロックまでに通るのは maxAttempts 回まで', async () => {
    const tenant = await makeTenant()
    const access = await issueCoupleAccess(db, tenant.id, {
      token: `c-${newId()}`,
      passcodeHash: 'h',
    })
    const opts = { maxAttempts: 5, lockMs: 60_000 }
    const results = await Promise.all(
      Array.from({ length: 40 }, () => reserveCoupleAttempt(db, tenant.id, access.id, opts, 100)),
    )
    expect(results.filter((r) => r.ok)).toHaveLength(5)
    expect(results.filter((r) => !r.ok && r.reason === 'locked')).toHaveLength(35)
  })

  it('無効化済み・他のテナントの対象は not_found', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const old = await issueCoupleAccess(db, a.id, { token: `c-${newId()}`, passcodeHash: 'h' })
    const opts = { maxAttempts: 5, lockMs: 1000 }
    expect(await reserveCoupleAttempt(db, b.id, old.id, opts)).toEqual({
      ok: false,
      reason: 'not_found',
    })
    await issueCoupleAccess(db, a.id, { token: `c-${newId()}`, passcodeHash: 'h' })
    expect(await reserveCoupleAttempt(db, a.id, old.id, opts)).toEqual({
      ok: false,
      reason: 'not_found',
    })
  })

  it('リセットすると失敗回数とロックが消える', async () => {
    const tenant = await makeTenant()
    const access = await issueCoupleAccess(db, tenant.id, {
      token: `c-${newId()}`,
      passcodeHash: 'h',
    })
    const opts = { maxAttempts: 2, lockMs: 1000 }
    await reserveCoupleAttempt(db, tenant.id, access.id, opts, 10)
    await reserveCoupleAttempt(db, tenant.id, access.id, opts, 10)
    await resetCoupleFailedAttempts(db, tenant.id, access.id)
    expect(await getActiveCoupleAccess(db, tenant.id)).toMatchObject({
      failedAttempts: 0,
      lockedUntil: null,
    })
  })

  it('他のテナントからは失敗回数の加算・リセット・規約同意ができない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const access = await issueCoupleAccess(db, a.id, { token: `c-${newId()}`, passcodeHash: 'h' })
    const opts = { maxAttempts: 5, lockMs: 1000 }

    expect(await reserveCoupleAttempt(db, b.id, access.id, opts)).toEqual({
      ok: false,
      reason: 'not_found',
    })
    await reserveCoupleAttempt(db, a.id, access.id, opts)
    await resetCoupleFailedAttempts(db, b.id, access.id)
    await recordCoupleTermsAgreement(db, b.id, access.id, 99)
    expect(await getActiveCoupleAccess(db, a.id)).toMatchObject({
      failedAttempts: 1,
      termsAgreedAt: null,
    })
  })

  it('規約への同意は最初の日時を残す', async () => {
    const tenant = await makeTenant()
    const access = await issueCoupleAccess(db, tenant.id, {
      token: `c-${newId()}`,
      passcodeHash: 'h',
    })
    await recordCoupleTermsAgreement(db, tenant.id, access.id, 111)
    await recordCoupleTermsAgreement(db, tenant.id, access.id, 222)
    expect((await getActiveCoupleAccess(db, tenant.id))?.termsAgreedAt).toBe(111)
  })
})

describe('visitor_sessions', () => {
  it('参加者のセッションは guest もあわせて返す', async () => {
    const tenant = await makeTenant()
    const guest = await makeGuest(tenant.id, 'g')
    const idHash = newId()
    await createVisitorSession(
      db,
      { idHash, tenantId: tenant.id, kind: 'guest', guestId: guest.id },
      500,
    )
    const found = await getVisitorSession(db, tenant.id, idHash)
    expect(found?.session).toMatchObject({
      idHash,
      kind: 'guest',
      guestId: guest.id,
      coupleAccessId: null,
      createdAt: 500,
      lastSeenAt: 500,
    })
    expect(found?.guest?.nickname).toBe('g')
    expect(found?.coupleAccess).toBeNull()
  })

  it('新郎新婦のセッションは couple_access もあわせて返す（無効化済みも返す）', async () => {
    const tenant = await makeTenant()
    const access = await issueCoupleAccess(db, tenant.id, {
      token: `c-${newId()}`,
      passcodeHash: 'h',
    })
    const idHash = newId()
    await createVisitorSession(db, {
      idHash,
      tenantId: tenant.id,
      kind: 'couple',
      coupleAccessId: access.id,
    })
    const found = await getVisitorSession(db, tenant.id, idHash)
    expect(found?.session.kind).toBe('couple')
    expect(found?.coupleAccess?.id).toBe(access.id)
    expect(found?.guest).toBeNull()
  })

  it('他のテナントのセッションは取得できない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const guest = await makeGuest(a.id, 'g')
    const idHash = newId()
    await createVisitorSession(db, { idHash, tenantId: a.id, kind: 'guest', guestId: guest.id })
    expect(await getVisitorSession(db, b.id, idHash)).toBeUndefined()
    expect(await getVisitorSession(db, a.id, newId())).toBeUndefined()
  })

  it('last_seen_at は間隔があいたときだけ更新する。他のテナントからは更新できない', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    const guest = await makeGuest(a.id, 'g')
    const idHash = newId()
    await createVisitorSession(
      db,
      { idHash, tenantId: a.id, kind: 'guest', guestId: guest.id },
      1000,
    )
    expect(await touchVisitorSession(db, a.id, idHash, 600, 1599)).toBe(false)
    expect(await touchVisitorSession(db, b.id, idHash, 600, 5000)).toBe(false)
    expect(await touchVisitorSession(db, a.id, idHash, 600, 1600)).toBe(true)
    expect((await getVisitorSession(db, a.id, idHash))?.session.lastSeenAt).toBe(1600)
  })
})
