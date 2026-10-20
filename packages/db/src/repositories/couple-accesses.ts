import { and, eq, isNull, lte, or, sql } from 'drizzle-orm'
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

export type AttemptReservation =
  /** 照合してよい。この試行が失敗なら、`locked` なら即ロック済み、そうでなければ `remainingAttempts` 回残っている */
  | { ok: true; locked: boolean; lockedUntil: number | null; remainingAttempts: number }
  /** ロック中のため照合してはならない */
  | { ok: false; reason: 'locked'; lockedUntil: number }
  /** 対象がない（他のテナントのもの、無効化済みなど） */
  | { ok: false; reason: 'not_found' }

/**
 * パスコードの照合の「前」に、試行を 1 回分予約する。
 * ロックの判定と失敗回数の加算を 1 つの条件付き UPDATE で行うので、同時に大量に送られても、
 * 照合まで進める試行は `maxAttempts` 回までになる（照合の結果を待たずに数えるため）。
 * `maxAttempts` 回目の予約でロックを確定し、失敗回数を 0 に戻す。その試行自体は照合してよい
 * （正しければ入場でき、`resetCoupleFailedAttempts` でロックも消える）。
 * ロック中は何も更新しない（ロックの期限を延ばさない）。
 */
export async function reserveCoupleAttempt(
  db: Db,
  tenantId: string,
  coupleAccessId: string,
  options: { maxAttempts: number; lockMs: number },
  now: number = Date.now(),
): Promise<AttemptReservation> {
  const { maxAttempts, lockMs } = options
  const [row] = await db
    .update(coupleAccesses)
    .set({
      failedAttempts: sql`CASE WHEN ${coupleAccesses.failedAttempts} + 1 >= ${maxAttempts} THEN 0 ELSE ${coupleAccesses.failedAttempts} + 1 END`,
      lockedUntil: sql`CASE WHEN ${coupleAccesses.failedAttempts} + 1 >= ${maxAttempts} THEN ${now + lockMs} ELSE ${coupleAccesses.lockedUntil} END`,
    })
    .where(
      and(
        eq(coupleAccesses.id, coupleAccessId),
        eq(coupleAccesses.tenantId, tenantId),
        isNull(coupleAccesses.revokedAt),
        or(isNull(coupleAccesses.lockedUntil), lte(coupleAccesses.lockedUntil, now)),
      ),
    )
    .returning({
      failedAttempts: coupleAccesses.failedAttempts,
      lockedUntil: coupleAccesses.lockedUntil,
    })
  if (row) {
    const locked = row.lockedUntil !== null && row.lockedUntil > now
    return {
      ok: true,
      locked,
      lockedUntil: locked ? row.lockedUntil : null,
      remainingAttempts: locked ? 0 : Math.max(0, maxAttempts - row.failedAttempts),
    }
  }
  // 更新されなかった: ロック中か、対象がない
  const [current] = await db
    .select({ lockedUntil: coupleAccesses.lockedUntil })
    .from(coupleAccesses)
    .where(
      and(
        eq(coupleAccesses.id, coupleAccessId),
        eq(coupleAccesses.tenantId, tenantId),
        isNull(coupleAccesses.revokedAt),
      ),
    )
  if (current?.lockedUntil != null && current.lockedUntil > now) {
    return { ok: false, reason: 'locked', lockedUntil: current.lockedUntil }
  }
  return { ok: false, reason: 'not_found' }
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
