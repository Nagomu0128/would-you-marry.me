import { PHOTO_BATCH_MAX } from '@wym/shared'
import { describe, expect, it } from 'vitest'
import {
  capReason,
  focusAfterRemove,
  fullReason,
  isFileRejection,
  overallPercent,
  pendingCount,
  planAdd,
  type QueueItem,
  queueLimit,
  queueReducer,
  rejectionNotice,
  roomLeft,
} from './upload-queue'

const file = new File(['x'], 'a.jpg')
const item = (id: string, status: QueueItem['status'] = 'waiting'): QueueItem => ({
  id,
  file,
  status,
})
const statuses = (items: readonly QueueItem[]) => items.map((i) => `${i.id}:${i.status}`)

describe('上限の計算', () => {
  it('1 回の上限と残り枚数の少ないほうまで', () => {
    expect(queueLimit(88)).toBe(PHOTO_BATCH_MAX)
    expect(queueLimit(5)).toBe(5)
    expect(queueLimit(0)).toBe(0)
    expect(queueLimit(-3)).toBe(0)
  })

  it('加えられる枚数は、送れていない写真の分を引く', () => {
    expect(roomLeft(0, 88)).toBe(20)
    expect(roomLeft(18, 88)).toBe(2)
    expect(roomLeft(3, 5)).toBe(2)
    expect(roomLeft(25, 88)).toBe(0)
  })

  it('どちらの上限が効いたかを返す', () => {
    expect(capReason(88)).toBe('batch')
    expect(capReason(20)).toBe('batch')
    expect(capReason(19)).toBe('remaining')
  })

  it('超えた分を捨てる枚数と理由を返す', () => {
    expect(planAdd(3, 0, 88)).toEqual({ accepted: 3, cappedBy: null })
    expect(planAdd(25, 0, 88)).toEqual({ accepted: 20, cappedBy: 'batch' })
    expect(planAdd(10, 15, 88)).toEqual({ accepted: 5, cappedBy: 'batch' })
    expect(planAdd(8, 0, 5)).toEqual({ accepted: 5, cappedBy: 'remaining' })
    expect(planAdd(20, 0, 20)).toEqual({ accepted: 20, cappedBy: null })
  })

  it('いっぱいのときの理由', () => {
    expect(fullReason(20, 88)).toBe('batch')
    expect(fullReason(5, 5)).toBe('remaining')
    expect(fullReason(3, 88)).toBeNull()
    // 投稿枚数の上限は別の表示（UPLOAD_LIMIT_REACHED）
    expect(fullReason(0, 0)).toBeNull()
  })
})

describe('送信前に外した写真の通知', () => {
  it('1 枚だけ選んだときは枚数を出さず、理由だけ', () => {
    expect(rejectionNotice(1, ['FILE_TOO_LARGE'])).toEqual({
      count: null,
      reasons: ['FILE_TOO_LARGE'],
    })
  })

  it('複数枚のときは枚数と、重複を除いた理由', () => {
    expect(
      rejectionNotice(5, ['UNSUPPORTED_FILE_TYPE', 'FILE_TOO_LARGE', 'UNSUPPORTED_FILE_TYPE']),
    ).toEqual({ count: 3, reasons: ['UNSUPPORTED_FILE_TYPE', 'FILE_TOO_LARGE'] })
  })

  it('だめな写真がなければ枚数も出さない', () => {
    expect(rejectionNotice(3, [])).toEqual({ count: null, reasons: [] })
  })

  it('サーバーが返す形式・サイズのコードだけを対象にする', () => {
    expect(isFileRejection('FILE_TOO_LARGE')).toBe(true)
    expect(isFileRejection('UNSUPPORTED_FILE_TYPE')).toBe(true)
    expect(isFileRejection('UPLOAD_LIMIT_REACHED')).toBe(false)
    expect(isFileRejection(undefined)).toBe(false)
  })
})

describe('全体の進み', () => {
  it('送れた枚数と今の写真の割合から求める', () => {
    expect(overallPercent(0, 1, 60)).toBe(60)
    expect(overallPercent(1, 3, 50)).toBe(50)
    expect(overallPercent(2, 3, 0)).toBe(67)
    expect(overallPercent(3, 3, 0)).toBe(100)
  })

  it('範囲に収める', () => {
    expect(overallPercent(0, 0, 50)).toBe(0)
    expect(overallPercent(0, 2, 150)).toBe(50)
    expect(overallPercent(0, 2, -10)).toBe(0)
  })
})

describe('外したあとのフォーカス', () => {
  it('次の写真があればその位置、なければ選ぶボタン', () => {
    expect(focusAfterRemove(2, 0)).toBe(0)
    expect(focusAfterRemove(2, 1)).toBe(1)
    expect(focusAfterRemove(2, 2)).toBe('choose')
    expect(focusAfterRemove(0, 0)).toBe('choose')
  })
})

describe('queueReducer', () => {
  it('加える（上限を超えない）', () => {
    const state = queueReducer([item('a')], {
      type: 'add',
      items: [item('b'), item('c'), item('d')],
      limit: 3,
    })
    expect(state.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('送れた写真は枠を使わない', () => {
    const state = queueReducer([item('a', 'sent'), item('b')], {
      type: 'add',
      items: [item('c')],
      limit: 2,
    })
    expect(state.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(pendingCount(state)).toBe(2)
  })

  it('加えると、失敗した写真は送信待ちに戻る', () => {
    const state = queueReducer([item('a', 'failed')], {
      type: 'add',
      items: [item('b')],
      limit: 5,
    })
    expect(statuses(state)).toEqual(['a:waiting', 'b:waiting'])
  })

  it('加えられなければ同じ配列を返す', () => {
    const before = [item('a')]
    expect(queueReducer(before, { type: 'add', items: [item('b')], limit: 1 })).toBe(before)
  })

  it('外す・状態を更新する', () => {
    let state: readonly QueueItem[] = [item('a'), item('b'), item('c')]
    state = queueReducer(state, { type: 'remove', id: 'b' })
    state = queueReducer(state, { type: 'status', id: 'c', status: 'sending' })
    expect(statuses(state)).toEqual(['a:waiting', 'c:sending'])
  })

  it('送信を始めると、送れていない写真がすべて送信待ちになる', () => {
    const state = queueReducer([item('a', 'sent'), item('b', 'failed'), item('c')], {
      type: 'begin',
    })
    expect(statuses(state)).toEqual(['a:sent', 'b:waiting', 'c:waiting'])
  })

  it('送信が終わったら失敗した写真だけを残す', () => {
    const state = queueReducer(
      [item('a', 'sent'), item('b', 'failed'), item('c', 'sent'), item('d', 'failed')],
      { type: 'keepFailed' },
    )
    expect(statuses(state)).toEqual(['b:failed', 'd:failed'])
  })

  it('中断すると送信中の写真が送信待ちに戻る', () => {
    const state = queueReducer([item('a', 'sent'), item('b', 'sending'), item('c')], {
      type: 'interrupt',
    })
    expect(statuses(state)).toEqual(['a:sent', 'b:waiting', 'c:waiting'])
  })

  it('リセットで空になる', () => {
    expect(queueReducer([item('a'), item('b')], { type: 'reset' })).toEqual([])
  })
})
