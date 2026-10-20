import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '../index'
import { newId } from '../lib'
import { type CoupleAccess, coupleAccesses, visitorSessions } from '../schema'

/** 有効な（無効化されていない）新郎新婦用のトークンとパスコードを取る */
export async function getActiveCoupleAccess(
  db: Db,
  tenantId: string,
): Promise<CoupleAccess | undefined> {
  const [row] = await db
    .select()
    .from(coupleAccesses)
    .where(and(eq(coupleAccesses.tenantId, tenantId), isNull(coupleAccesses.revokedAt)))
  return row
}

export type IssueCoupleAccessInput = {
  /** 呼び出し側で作った 32 バイトの乱数（base64url） */
  token: string
  /** `pbkdf2-sha256$<反復回数>$<ソルト>$<ハッシュ>` */
  passcodeHash: string
}

/**
 * 新郎新婦用のトークンとパスコードを発行する。バッチで、古いものを無効にし、
 * その新郎新婦のセッションを削除して、新しいものを入れる。
 */
export async function issueCoupleAccess(
  db: Db,
  tenantId: string,
  input: IssueCoupleAccessInput,
  now: number = Date.now(),
): Promise<CoupleAccess> {
  const row: CoupleAccess = {
    id: newId(),
    tenantId,
    token: input.token,
    passcodeHash: input.passcodeHash,
    failedAttempts: 0,
    lockedUntil: null,
    termsAgreedAt: null,
    createdAt: now,
    revokedAt: null,
  }
  await db.batch([
    db.delete(visitorSessions).where(
      and(
        eq(visitorSessions.tenantId, tenantId),
        eq(visitorSessions.kind, 'couple'),
        // 無効にする前の有効なものに紐づくセッション
        sql`${visitorSessions.coupleAccessId} IN (
          SELECT id FROM couple_accesses WHERE tenant_id = ${tenantId} AND revoked_at IS NULL
        )`,
      ),
    ),
    db
      .update(coupleAccesses)
      .set({ revokedAt: now })
      .where(and(eq(coupleAccesses.tenantId, tenantId), isNull(coupleAccesses.revokedAt))),
    db.insert(coupleAccesses).values(row),
  ])
  return row
}

/** テナント ID とトークンで、有効な新郎新婦用トークンを照合する。一致しなければ undefined */
export async function findActiveCoupleAccessByToken(
  db: Db,
  tenantId: string,
  token: string,
): Promise<CoupleAccess | undefined> {
  const [row] = await db
    .select()
    .from(coupleAccesses)
    .where(
      and(
        eq(coupleAccesses.tenantId, tenantId),
        eq(coupleAccesses.token, token),
        isNull(coupleAccesses.revokedAt),
      ),
    )
  return row
}

export type FailedAttemptResult = {
  /** ロックされたか */
  locked: boolean
  /** ロックされている場合、入力を受け付けない時刻まで（UNIX ミリ秒） */
  lockedUntil: number | null
  /** あと何回失敗できるか（ロックされたときは 0） */
  remainingAttempts: number
}

/**
 * パスコードの失敗を記録する。失敗回数を 1 つ増やし、`maxAttempts` 回に達したら
 * `lockMs` の間ロックして、失敗回数を 0 に戻す（ロックが明けたらまた `maxAttempts` 回試せる）。
 * 1 つの UPDATE で行うので、同時に失敗しても数え落とさない。
 * @returns 対象がない（他のテナントのものなど）ときは undefined
 */
export async function recordCoupleFailedAttempt(
  db: Db,
  tenantId: string,
  coupleAccessId: string,
  options: { maxAttempts: number; lockMs: number },
  now: number = Date.now(),
): Promise<FailedAttemptResult | undefined> {
  const { maxAttempts, lockMs } = options
  const [row] = await db
    .update(coupleAccesses)
    .set({
      failedAttempts: sql`CASE WHEN ${coupleAccesses.failedAttempts} + 1 >= ${maxAttempts} THEN 0 ELSE ${coupleAccesses.failedAttempts} + 1 END`,
      lockedUntil: sql`CASE WHEN ${coupleAccesses.failedAttempts} + 1 >= ${maxAttempts} THEN ${now + lockMs} ELSE ${coupleAccesses.lockedUntil} END`,
    })
    .where(and(eq(coupleAccesses.id, coupleAccessId), eq(coupleAccesses.tenantId, tenantId)))
    .returning({
      failedAttempts: coupleAccesses.failedAttempts,
      lockedUntil: coupleAccesses.lockedUntil,
    })
  if (!row) return undefined
  const locked = row.lockedUntil !== null && row.lockedUntil > now
  return {
    locked,
    lockedUntil: locked ? row.lockedUntil : null,
    remainingAttempts: locked ? 0 : Math.max(0, maxAttempts - row.failedAttempts),
  }
}

/** パスコードの失敗回数とロックをリセットする（入場に成功したとき） */
export async function resetCoupleFailedAttempts(
  db: Db,
  tenantId: string,
  coupleAccessId: string,
): Promise<void> {
  await db
    .update(coupleAccesses)
    .set({ failedAttempts: 0, lockedUntil: null })
    .where(and(eq(coupleAccesses.id, coupleAccessId), eq(coupleAccesses.tenantId, tenantId)))
}

/** 新郎新婦の規約への同意を記録する（最初の同意の日時を残す） */
export async function recordCoupleTermsAgreement(
  db: Db,
  tenantId: string,
  coupleAccessId: string,
  now: number = Date.now(),
): Promise<void> {
  await db
    .update(coupleAccesses)
    .set({ termsAgreedAt: now })
    .where(
      and(
        eq(coupleAccesses.id, coupleAccessId),
        eq(coupleAccesses.tenantId, tenantId),
        isNull(coupleAccesses.termsAgreedAt),
      ),
    )
}
