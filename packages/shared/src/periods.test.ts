import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  canCoupleUse,
  canGuestUse,
  canJoin,
  getPhaseBoundaries,
  getTenantPhase,
  isValidEventDate,
  jstMidnight,
  type PeriodTenant,
  toJstDateString,
  toJstDateTimeString,
} from './periods'

const iso = (d: Date) => d.toISOString()

describe('addMonths', () => {
  it('同じ日がある月はそのまま加算する', () => {
    expect(addMonths('2026-10-15', 3)).toBe('2027-01-15')
    expect(addMonths('2026-10-31', 3)).toBe('2027-01-31')
  })

  it('月末は繰り下げる', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonths('2026-10-31', 6)).toBe('2027-04-30')
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28')
  })

  it('うるう年は 2/29 になる', () => {
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2027-08-31', 6)).toBe('2028-02-29')
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28')
  })

  it('年をまたぐ・負の値', () => {
    expect(addMonths('2026-12-15', 2)).toBe('2027-02-15')
    expect(addMonths('2026-01-31', -2)).toBe('2025-11-30')
  })

  it('不正な日付は例外', () => {
    expect(() => addMonths('2026-02-30', 1)).toThrow(RangeError)
  })
})

describe('addDays', () => {
  it('月・年をまたぐ', () => {
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('getPhaseBoundaries（計算例）', () => {
  it('2026-10-31', () => {
    const b = getPhaseBoundaries('2026-10-31')
    expect(iso(b.joiningStart)).toBe('2026-10-30T15:00:00.000Z') // 10/31 0:00 JST
    expect(iso(b.viewingStart)).toBe('2026-11-01T15:00:00.000Z') // 11/02 0:00 JST
    expect(iso(b.coupleOnlyStart)).toBe('2027-01-31T15:00:00.000Z') // 2027-02-01 0:00 JST
    expect(iso(b.deletionAt)).toBe('2027-04-30T15:00:00.000Z') // 2027-05-01 0:00 JST
  })

  it('2026-11-30（2/28 に繰り下げ）', () => {
    const b = getPhaseBoundaries('2026-11-30')
    expect(toJstDateTimeString(b.joiningStart)).toBe('2026-11-30 00:00')
    expect(toJstDateTimeString(b.viewingStart)).toBe('2026-12-02 00:00')
    expect(toJstDateTimeString(b.coupleOnlyStart)).toBe('2027-03-01 00:00')
    expect(toJstDateTimeString(b.deletionAt)).toBe('2027-05-31 00:00')
  })

  it('2027-08-31（うるう年の 2/29）', () => {
    const b = getPhaseBoundaries('2027-08-31')
    expect(toJstDateTimeString(b.joiningStart)).toBe('2027-08-31 00:00')
    expect(toJstDateTimeString(b.viewingStart)).toBe('2027-09-02 00:00')
    expect(toJstDateTimeString(b.coupleOnlyStart)).toBe('2027-12-01 00:00')
    expect(toJstDateTimeString(b.deletionAt)).toBe('2028-03-01 00:00')
  })

  it('不正な開催日は例外', () => {
    expect(() => getPhaseBoundaries('2026-13-01')).toThrow(RangeError)
    expect(() => getPhaseBoundaries('2026/10/31')).toThrow(RangeError)
  })
})

describe('getTenantPhase（各境界の 1 ミリ秒前と境界ちょうど）', () => {
  const cases: Array<[string, string]> = [
    ['2026-10-31', 'a'],
    ['2026-11-30', 'b'],
    ['2027-08-31', 'c'],
  ]
  for (const [eventDate] of cases) {
    it(`${eventDate}`, () => {
      const b = getPhaseBoundaries(eventDate)
      const at = (d: Date, delta: number) => new Date(d.getTime() + delta)
      expect(getTenantPhase(eventDate, new Date(0))).toBe('preparation')
      expect(getTenantPhase(eventDate, at(b.joiningStart, -1))).toBe('preparation')
      expect(getTenantPhase(eventDate, b.joiningStart)).toBe('joining')
      expect(getTenantPhase(eventDate, at(b.viewingStart, -1))).toBe('joining')
      expect(getTenantPhase(eventDate, b.viewingStart)).toBe('viewing')
      expect(getTenantPhase(eventDate, at(b.coupleOnlyStart, -1))).toBe('viewing')
      expect(getTenantPhase(eventDate, b.coupleOnlyStart)).toBe('couple_only')
      expect(getTenantPhase(eventDate, at(b.deletionAt, -1))).toBe('couple_only')
      expect(getTenantPhase(eventDate, b.deletionAt)).toBe('expired')
      expect(getTenantPhase(eventDate, new Date('2100-01-01T00:00:00Z'))).toBe('expired')
    })
  }

  it('日本時間の 0:00 で切り替わる（UTC の 0:00 ではない）', () => {
    expect(getTenantPhase('2026-10-31', new Date('2026-10-30T14:59:59.999Z'))).toBe('preparation')
    expect(getTenantPhase('2026-10-31', new Date('2026-10-30T15:00:00.000Z'))).toBe('joining')
    expect(getTenantPhase('2026-10-31', new Date('2026-10-31T00:00:00.000Z'))).toBe('joining')
  })
})

describe('canJoin / canGuestUse / canCoupleUse', () => {
  const tenant: PeriodTenant = { eventDate: '2026-10-31', suspended: false, dataDeletedAt: null }
  const b = getPhaseBoundaries(tenant.eventDate)
  const times = {
    preparation: new Date(b.joiningStart.getTime() - 1),
    joining: b.joiningStart,
    viewing: b.viewingStart,
    couple_only: b.coupleOnlyStart,
    expired: b.deletionAt,
  }

  it('期間ごとの可否（tenant-periods.md の表）', () => {
    const row = (now: Date) => [
      canJoin(tenant, now),
      canGuestUse(tenant, now),
      canCoupleUse(tenant, now),
    ]
    expect(row(times.preparation)).toEqual([false, false, true])
    expect(row(times.joining)).toEqual([true, true, true])
    expect(row(times.viewing)).toEqual([false, true, true])
    expect(row(times.couple_only)).toEqual([false, false, true])
    expect(row(times.expired)).toEqual([false, false, false])
  })

  it('停止中は期間にかかわらずすべて false', () => {
    const suspended = { ...tenant, suspended: true }
    for (const now of Object.values(times)) {
      expect(canJoin(suspended, now)).toBe(false)
      expect(canGuestUse(suspended, now)).toBe(false)
      expect(canCoupleUse(suspended, now)).toBe(false)
    }
  })

  it('データ削除済みは常に false（Date でもミリ秒でも）', () => {
    for (const dataDeletedAt of [new Date(1), 1, 0]) {
      const deleted = { ...tenant, dataDeletedAt }
      for (const now of Object.values(times)) {
        expect(canJoin(deleted, now)).toBe(false)
        expect(canGuestUse(deleted, now)).toBe(false)
        expect(canCoupleUse(deleted, now)).toBe(false)
      }
    }
  })

  it('開催日を変更するとすぐ新しい開催日で計算される', () => {
    const moved = { ...tenant, eventDate: '2027-01-01' }
    expect(canJoin(tenant, times.joining)).toBe(true)
    expect(canJoin(moved, times.joining)).toBe(false)
  })
})

describe('日本時間の日付・時刻', () => {
  it('toJstDateString', () => {
    expect(toJstDateString(new Date('2026-10-30T14:59:59.999Z'))).toBe('2026-10-30')
    expect(toJstDateString(new Date('2026-10-30T15:00:00.000Z'))).toBe('2026-10-31')
    expect(toJstDateString(new Date('2026-12-31T15:00:00.000Z'))).toBe('2027-01-01')
  })

  it('toJstDateTimeString', () => {
    expect(toJstDateTimeString(new Date('2026-10-31T03:05:00.000Z'))).toBe('2026-10-31 12:05')
  })

  it('jstMidnight は toJstDateString と往復できる', () => {
    expect(jstMidnight('2026-10-31').toISOString()).toBe('2026-10-30T15:00:00.000Z')
    expect(toJstDateString(jstMidnight('2028-02-29'))).toBe('2028-02-29')
  })

  it('isValidEventDate', () => {
    expect(isValidEventDate('2026-10-31')).toBe(true)
    expect(isValidEventDate('2028-02-29')).toBe(true)
    expect(isValidEventDate('2027-02-29')).toBe(false)
    expect(isValidEventDate('2026-04-31')).toBe(false)
    expect(isValidEventDate('2026-13-01')).toBe(false)
    expect(isValidEventDate('2026-1-1')).toBe(false)
    expect(isValidEventDate('2026-10-31T00:00')).toBe(false)
    expect(isValidEventDate('')).toBe(false)
  })
})
