import { and, eq, lte } from 'drizzle-orm'
import type { Db } from '../index'
import {
  type CoupleAccess,
  coupleAccesses,
  type Guest,
  guests,
  type VisitorSession,
  visitorSessions,
} from '../schema'

export type CreateVisitorSessionInput = {
  /** セッション ID の SHA-256（16 進数） */
  idHash: string
  tenantId: string
} & ({ kind: 'guest'; guestId: string } | { kind: 'couple'; coupleAccessId: string })

/** セッションを作る */
export async function createVisitorSession(
  db: Db,
  input: CreateVisitorSessionInput,
  now: number = Date.now(),
): Promise<VisitorSession> {
  const row: VisitorSession = {
    idHash: input.idHash,
    tenantId: input.tenantId,
    kind: input.kind,
    guestId: input.kind === 'guest' ? input.guestId : null,
    coupleAccessId: input.kind === 'couple' ? input.coupleAccessId : null,
    createdAt: now,
    lastSeenAt: now,
  }
  await db.insert(visitorSessions).values(row)
  return row
}

export type VisitorSessionDetail = {
  session: VisitorSession
  /** `kind = guest` のとき */
  guest: Guest | null
  /** `kind = couple` のとき（無効化済みのものも返す。`revokedAt` で判定する） */
  coupleAccess: CoupleAccess | null
}

/**
 * セッション ID のハッシュとテナント ID でセッションを取る。
 * 参加者なら guest、新郎新婦なら couple_access もあわせて返す。
 * 他のテナントのセッションは見つからない。
 */
export async function getVisitorSession(
  db: Db,
  tenantId: string,
  idHash: string,
): Promise<VisitorSessionDetail | undefined> {
  const [row] = await db
    .select({ session: visitorSessions, guest: guests, coupleAccess: coupleAccesses })
    .from(visitorSessions)
    .leftJoin(
      guests,
      and(eq(guests.id, visitorSessions.guestId), eq(guests.tenantId, visitorSessions.tenantId)),
    )
    .leftJoin(
      coupleAccesses,
      and(
        eq(coupleAccesses.id, visitorSessions.coupleAccessId),
        eq(coupleAccesses.tenantId, visitorSessions.tenantId),
      ),
    )
    .where(and(eq(visitorSessions.idHash, idHash), eq(visitorSessions.tenantId, tenantId)))
  return row
}

/**
 * セッションの `last_seen_at` を更新する。前回から `intervalMs` 以上たっているときだけ書く。
 * @returns 更新したか
 */
export async function touchVisitorSession(
  db: Db,
  tenantId: string,
  idHash: string,
  intervalMs: number,
  now: number = Date.now(),
): Promise<boolean> {
  const rows = await db
    .update(visitorSessions)
    .set({ lastSeenAt: now })
    .where(
      and(
        eq(visitorSessions.idHash, idHash),
        eq(visitorSessions.tenantId, tenantId),
        lte(visitorSessions.lastSeenAt, now - intervalMs),
      ),
    )
    .returning({ idHash: visitorSessions.idHash })
  return rows.length > 0
}
