import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../index'
import { newId } from '../lib'
import { type JoinToken, joinTokens } from '../schema'

/** 有効な（無効化されていない）参加トークンを取る */
export async function getActiveJoinToken(db: Db, tenantId: string): Promise<JoinToken | undefined> {
  const [row] = await db
    .select()
    .from(joinTokens)
    .where(and(eq(joinTokens.tenantId, tenantId), isNull(joinTokens.revokedAt)))
  return row
}

/**
 * 参加トークンを発行する。古い有効なトークンに `revoked_at` を付け、新しいものを入れる
 * （バッチで原子的に実行する）。
 * @param token 呼び出し側で作った 32 バイトの乱数（base64url）
 */
export async function issueJoinToken(
  db: Db,
  tenantId: string,
  token: string,
  now: number = Date.now(),
): Promise<JoinToken> {
  const row: JoinToken = { id: newId(), tenantId, token, createdAt: now, revokedAt: null }
  await db.batch([
    db
      .update(joinTokens)
      .set({ revokedAt: now })
      .where(and(eq(joinTokens.tenantId, tenantId), isNull(joinTokens.revokedAt))),
    db.insert(joinTokens).values(row),
  ])
  return row
}

/** テナント ID とトークンで、有効なトークンを照合する。一致しなければ undefined */
export async function findActiveJoinToken(
  db: Db,
  tenantId: string,
  token: string,
): Promise<JoinToken | undefined> {
  const [row] = await db
    .select()
    .from(joinTokens)
    .where(
      and(
        eq(joinTokens.tenantId, tenantId),
        eq(joinTokens.token, token),
        isNull(joinTokens.revokedAt),
      ),
    )
  return row
}
