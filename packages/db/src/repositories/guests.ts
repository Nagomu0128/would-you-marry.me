import { and, asc, count, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import type { Db } from '../index'
import { isUniqueConstraintError, newId } from '../lib'
import { type Guest, guests, photos } from '../schema'

/** 参加者を作る（ニックネームは未登録） */
export async function createGuest(
  db: Db,
  tenantId: string,
  now: number = Date.now(),
): Promise<Guest> {
  const [row] = await db
    .insert(guests)
    .values({
      id: newId(),
      tenantId,
      nickname: null,
      nicknameKey: null,
      termsAgreedAt: null,
      createdAt: now,
      lastSeenAt: now,
    })
    .returning()
  if (!row) throw new Error('failed to create guest')
  return row
}

export async function getGuest(
  db: Db,
  tenantId: string,
  guestId: string,
): Promise<Guest | undefined> {
  const [row] = await db
    .select()
    .from(guests)
    .where(and(eq(guests.id, guestId), eq(guests.tenantId, tenantId)))
  return row
}

export type SetNicknameResult =
  | { ok: true; guest: Guest }
  | { ok: false; reason: 'taken' | 'not_found' }

/**
 * ニックネームを設定する（参加者本人の登録・変更、管理者による変更の両方で使う）。
 * 同じテナントで使用中なら `{ ok: false, reason: 'taken' }`、対象の参加者がいなければ
 * `{ ok: false, reason: 'not_found' }` を返す。
 * @param nickname 表示用（検証・整形は呼び出し側）
 * @param nicknameKey 重複判定用（前後の空白を除いた値。仮置き）
 */
export async function setGuestNickname(
  db: Db,
  tenantId: string,
  guestId: string,
  input: { nickname: string; nicknameKey: string },
): Promise<SetNicknameResult> {
  try {
    const [row] = await db
      .update(guests)
      .set({ nickname: input.nickname, nicknameKey: input.nicknameKey })
      .where(and(eq(guests.id, guestId), eq(guests.tenantId, tenantId)))
      .returning()
    return row ? { ok: true, guest: row } : { ok: false, reason: 'not_found' }
  } catch (error) {
    if (isUniqueConstraintError(error)) return { ok: false, reason: 'taken' }
    throw error
  }
}

/** 規約への同意を記録する（最初の同意の日時を残す） */
export async function recordGuestTermsAgreement(
  db: Db,
  tenantId: string,
  guestId: string,
  now: number = Date.now(),
): Promise<void> {
  await db
    .update(guests)
    .set({ termsAgreedAt: now })
    .where(and(eq(guests.id, guestId), eq(guests.tenantId, tenantId), isNull(guests.termsAgreedAt)))
}

export type GuestWithPhotoCount = Guest & { photoCount: number }

/** 参加者の一覧（投稿枚数つき）。ニックネーム順、未登録の人は後ろに作成順 */
export async function listGuests(db: Db, tenantId: string): Promise<GuestWithPhotoCount[]> {
  const rows = await db
    .select({ guest: guests, photoCount: count(photos.id) })
    .from(guests)
    .leftJoin(photos, and(eq(photos.guestId, guests.id), eq(photos.tenantId, guests.tenantId)))
    .where(eq(guests.tenantId, tenantId))
    .groupBy(guests.id)
    .orderBy(sql`${guests.nickname} IS NULL`, asc(guests.nickname), asc(guests.createdAt))
  return rows.map((row) => ({ ...row.guest, photoCount: row.photoCount }))
}

export type Uploader = { id: string; nickname: string; photoCount: number }

/** 投稿者の一覧（1 枚以上投稿した人だけ、ニックネーム順、枚数つき） */
export async function listUploaders(db: Db, tenantId: string): Promise<Uploader[]> {
  const rows = await db
    .select({ id: guests.id, nickname: guests.nickname, photoCount: count(photos.id) })
    .from(guests)
    .innerJoin(photos, and(eq(photos.guestId, guests.id), eq(photos.tenantId, guests.tenantId)))
    .where(and(eq(guests.tenantId, tenantId), isNotNull(guests.nickname)))
    .groupBy(guests.id)
    .orderBy(asc(guests.nickname), asc(guests.id))
  return rows.flatMap((row) =>
    row.nickname === null
      ? []
      : [{ id: row.id, nickname: row.nickname, photoCount: row.photoCount }],
  )
}

/**
 * `last_seen_at` を更新する。前回から `intervalMs` 以上たっているときだけ書く
 * （書き込みを減らすため。間隔は仮置きで 10 分）。
 * @returns 更新したか
 */
export async function touchGuestLastSeen(
  db: Db,
  tenantId: string,
  guestId: string,
  intervalMs: number,
  now: number = Date.now(),
): Promise<boolean> {
  const rows = await db
    .update(guests)
    .set({ lastSeenAt: now })
    .where(
      and(
        eq(guests.id, guestId),
        eq(guests.tenantId, tenantId),
        lte(guests.lastSeenAt, now - intervalMs),
      ),
    )
    .returning({ id: guests.id })
  return rows.length > 0
}
