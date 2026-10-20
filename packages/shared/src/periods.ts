// テナントの期間（docs/spec/tenant-periods.md）
// 日本時間（UTC+9、夏時間なし）で判定する。Intl に頼らず算術で計算する

export type TenantPhase = 'preparation' | 'joining' | 'viewing' | 'couple_only' | 'expired'

export type PhaseBoundaries = {
  /** 参加受付期間の開始（D の 0:00） */
  joiningStart: Date
  /** 閲覧期間の開始（D + 2 日の 0:00） */
  viewingStart: Date
  /** 新郎新婦閲覧期間の開始（addMonths(D, 3) + 1 日の 0:00） */
  coupleOnlyStart: Date
  /** 削除（expired）の開始（addMonths(D, 6) + 1 日の 0:00） */
  deletionAt: Date
}

/** 期間の判定に必要なテナントの項目 */
export type PeriodTenant = {
  eventDate: string
  suspended: boolean
  /** データ削除済みなら日時（Date またはミリ秒）、未削除なら null */
  dataDeletedAt: Date | number | null
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function daysInMonth(year: number, month: number): number {
  // month は 1〜12。翌月 0 日 = 当月末日
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** `YYYY-MM-DD` を [年, 月, 日] にする。実在しない日付なら null */
function parseDate(s: string): [number, number, number] | null {
  const m = DATE_PATTERN.exec(s)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return [year, month, day]
}

/** 開催日として正しい形式（`YYYY-MM-DD`）で、実在する日付か */
export function isValidEventDate(s: string): boolean {
  return parseDate(s) !== null
}

function mustParse(s: string): [number, number, number] {
  const parsed = parseDate(s)
  if (!parsed) throw new RangeError(`invalid date: ${s}`)
  return parsed
}

function format(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** `YYYY-MM-DD`（日本時間の日付）の 0:00 の瞬間 */
export function jstMidnight(date: string): Date {
  const [y, m, d] = mustParse(date)
  return new Date(Date.UTC(y, m - 1, d) - JST_OFFSET_MS)
}

/** 瞬間を日本時間の日付 `YYYY-MM-DD` にする */
export function toJstDateString(date: Date): string {
  const j = new Date(date.getTime() + JST_OFFSET_MS)
  return format(j.getUTCFullYear(), j.getUTCMonth() + 1, j.getUTCDate())
}

/** 瞬間を日本時間の `YYYY-MM-DD HH:mm` にする */
export function toJstDateTimeString(date: Date): string {
  const j = new Date(date.getTime() + JST_OFFSET_MS)
  const hh = String(j.getUTCHours()).padStart(2, '0')
  const mm = String(j.getUTCMinutes()).padStart(2, '0')
  return `${toJstDateString(date)} ${hh}:${mm}`
}

/** 日付に日数を足す（`YYYY-MM-DD` → `YYYY-MM-DD`） */
export function addDays(date: string, n: number): string {
  const [y, m, d] = mustParse(date)
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS)
  return format(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

/** 日付に月数を足す。同じ日がなければその月の末日にする（1/31 + 1 か月 = 2/28、うるう年は 2/29） */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = mustParse(date)
  const index = y * 12 + (m - 1) + n
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return format(year, month, Math.min(d, daysInMonth(year, month)))
}

/** 各期間の開始時刻（いずれも日本時間 0:00 の瞬間） */
export function getPhaseBoundaries(eventDate: string): PhaseBoundaries {
  return {
    joiningStart: jstMidnight(eventDate),
    viewingStart: jstMidnight(addDays(eventDate, 2)),
    coupleOnlyStart: jstMidnight(addDays(addMonths(eventDate, 3), 1)),
    deletionAt: jstMidnight(addDays(addMonths(eventDate, 6), 1)),
  }
}

/** 開催日と現在時刻から期間を求める。各期間は [開始, 終了) */
export function getTenantPhase(eventDate: string, now: Date): TenantPhase {
  const b = getPhaseBoundaries(eventDate)
  const t = now.getTime()
  if (t < b.joiningStart.getTime()) return 'preparation'
  if (t < b.viewingStart.getTime()) return 'joining'
  if (t < b.coupleOnlyStart.getTime()) return 'viewing'
  if (t < b.deletionAt.getTime()) return 'couple_only'
  return 'expired'
}

function isActive(tenant: PeriodTenant): boolean {
  return !tenant.suspended && tenant.dataDeletedAt === null
}

/** 参加 URL から新しく参加できるか */
export function canJoin(tenant: PeriodTenant, now: Date): boolean {
  return isActive(tenant) && getTenantPhase(tenant.eventDate, now) === 'joining'
}

/** 参加済みの参加者が使えるか */
export function canGuestUse(tenant: PeriodTenant, now: Date): boolean {
  if (!isActive(tenant)) return false
  const phase = getTenantPhase(tenant.eventDate, now)
  return phase === 'joining' || phase === 'viewing'
}

/** 新郎新婦が使えるか */
export function canCoupleUse(tenant: PeriodTenant, now: Date): boolean {
  return isActive(tenant) && getTenantPhase(tenant.eventDate, now) !== 'expired'
}
