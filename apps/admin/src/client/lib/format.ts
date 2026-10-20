import type { AdminTenant, TenantBoundaries } from '@wym/shared'
import { toJstDateString, toJstDateTimeString } from '@wym/shared'
import { ja } from '@wym/ui'

export type PeriodLabelKey = keyof typeof ja.admin.periodLabels

/** 期間のラベル。停止中を優先する */
export function periodLabelKey(tenant: Pick<AdminTenant, 'phase' | 'suspended'>): PeriodLabelKey {
  return tenant.suspended ? 'suspended' : tenant.phase
}

export function periodLabel(tenant: Pick<AdminTenant, 'phase' | 'suspended'>): string {
  return ja.admin.periodLabels[periodLabelKey(tenant)]
}

/** `2026-11-02T...` のような境界の前日を、日本時間の「M/D」にする */
export function formatMonthDay(date: Date): string {
  const [, m, d] = toJstDateString(date).split('-')
  return `${Number(m)}/${Number(d)}`
}

/** 期間の終わりの日（境界の前日、日本時間）。終わりのない期間は null */
export function periodEndLabel(
  phase: AdminTenant['phase'],
  boundaries: TenantBoundaries,
): string | null {
  const boundary = {
    preparation: boundaries.joiningStart,
    joining: boundaries.viewingStart,
    viewing: boundaries.coupleOnlyStart,
    couple_only: boundaries.deletionAt,
    expired: null,
  }[phase]
  if (boundary === null) return null
  return formatMonthDay(new Date(new Date(boundary).getTime() - 1))
}

/** データの削除予定日（日本時間の `YYYY-MM-DD`） */
export function deletionDateLabel(boundaries: TenantBoundaries): string {
  return toJstDateString(new Date(boundaries.deletionAt))
}

/** 「10/31 0:00」（日本時間） */
export function formatMonthDayTime(date: Date): string {
  const time = toJstDateTimeString(date).split(' ')[1] ?? '00:00'
  const [hh, mm] = time.split(':')
  return `${formatMonthDay(date)} ${Number(hh)}:${mm}`
}

/** 参加できる期間の表示。終わりは境界（含まない）の 1 分前 */
export function joinPeriodLabels(joiningStart: string, joiningEnd: string) {
  return {
    from: formatMonthDayTime(new Date(joiningStart)),
    to: formatMonthDayTime(new Date(new Date(joiningEnd).getTime() - 60 * 1000)),
  }
}

const numberFormat = new Intl.NumberFormat('ja-JP')
export function formatCount(n: number): string {
  return numberFormat.format(n)
}

/** 容量を GB などに整形する（1024 単位） */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  const text = i === 0 ? String(value) : value.toFixed(1)
  return `${text}${units[i]}`
}
