import { ja } from '@wym/ui'
import { describe, expect, it } from 'vitest'
import { BOUNDARIES } from '../test-utils'
import {
  deletionDateLabel,
  formatBytes,
  joinPeriodLabels,
  periodEndLabel,
  periodLabel,
} from './format'

describe('期間のラベル', () => {
  it('期間ごとのラベルを返す', () => {
    const l = ja.admin.periodLabels
    expect(periodLabel({ phase: 'preparation', suspended: false })).toBe(l.preparation)
    expect(periodLabel({ phase: 'joining', suspended: false })).toBe(l.joining)
    expect(periodLabel({ phase: 'viewing', suspended: false })).toBe(l.viewing)
    expect(periodLabel({ phase: 'couple_only', suspended: false })).toBe(l.couple_only)
    expect(periodLabel({ phase: 'expired', suspended: false })).toBe(l.expired)
  })

  it('停止中を優先して表示する', () => {
    for (const phase of ['preparation', 'joining', 'viewing', 'couple_only', 'expired'] as const) {
      expect(periodLabel({ phase, suspended: true })).toBe('停止中')
    }
  })
})

describe('日付の表示', () => {
  it('終わりの日は境界の前日（日本時間）', () => {
    expect(periodEndLabel('joining', BOUNDARIES)).toBe('11/1')
    expect(periodEndLabel('preparation', BOUNDARIES)).toBe('10/30')
    expect(periodEndLabel('viewing', BOUNDARIES)).toBe('1/31')
    expect(periodEndLabel('couple_only', BOUNDARIES)).toBe('4/30')
    expect(periodEndLabel('expired', BOUNDARIES)).toBeNull()
  })

  it('データの削除予定日', () => {
    expect(deletionDateLabel(BOUNDARIES)).toBe('2027-05-01')
  })

  it('参加できる期間は日本時間で、終わりは 23:59', () => {
    expect(joinPeriodLabels(BOUNDARIES.joiningStart, BOUNDARIES.viewingStart)).toEqual({
      from: '10/31 0:00',
      to: '11/1 23:59',
    })
  })

  it('容量を GB などに整形する', () => {
    expect(formatBytes(0)).toBe('0B')
    expect(formatBytes(1536)).toBe('1.5KB')
    expect(formatBytes(3.2 * 1024 ** 3)).toBe('3.2GB')
  })
})
