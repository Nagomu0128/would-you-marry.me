// 送信前の写真の一覧（SG-07）。状態の遷移と数の計算だけを、副作用のない関数にまとめる。
// 縮小の順次実行・送信のループ・object URL の寿命は、画面側の useUploadQueue が受け持つ。

import { PHOTO_BATCH_MAX } from '@wym/shared'

/** preparing は縮小画像（一覧用）がまだできていない間の見た目で、一覧の状態ではない */
export type ItemStatus = 'waiting' | 'sending' | 'sent' | 'failed'

export type QueueItem = {
  id: string
  file: File
  status: ItemStatus
}

/** 選んだ時点・送信時にだめだと分かる写真の理由 */
export type FileRejection = 'UNSUPPORTED_FILE_TYPE' | 'FILE_TOO_LARGE'

export function isFileRejection(code: string | undefined): code is FileRejection {
  return code === 'UNSUPPORTED_FILE_TYPE' || code === 'FILE_TOO_LARGE'
}

/** 送信がまだ済んでいない写真の数（一覧の枠を使っているもの） */
export function pendingCount(items: readonly QueueItem[]): number {
  return items.filter((item) => item.status !== 'sent').length
}

/** 一覧に持てる枚数。1 回の上限と、残りの投稿枚数の少ないほう */
export function queueLimit(remaining: number): number {
  return Math.max(0, Math.min(PHOTO_BATCH_MAX, remaining))
}

/** いま加えられる枚数 */
export function roomLeft(pending: number, remaining: number): number {
  return Math.max(0, queueLimit(remaining) - pending)
}

export type CapReason = 'batch' | 'remaining'

/** 上限が 1 回の枚数と残りの枚数のどちらで決まっているか（同じなら 1 回の枚数） */
export function capReason(remaining: number): CapReason {
  return remaining < PHOTO_BATCH_MAX ? 'remaining' : 'batch'
}

export type AddPlan = {
  /** 加える枚数 */
  accepted: number
  /** 超えた分を捨てたときの理由。超えていなければ null */
  cappedBy: CapReason | null
}

export function planAdd(picked: number, pending: number, remaining: number): AddPlan {
  const accepted = Math.min(picked, roomLeft(pending, remaining))
  return { accepted, cappedBy: accepted < picked ? capReason(remaining) : null }
}

/** 選べる枚数がいっぱいのときの理由。まだ加えられる、または投稿枚数が 0 のときは null */
export function fullReason(pending: number, remaining: number): CapReason | null {
  if (remaining <= 0) return null
  return roomLeft(pending, remaining) === 0 ? capReason(remaining) : null
}

export type RejectionNotice = {
  /** 複数枚を選んだときだけ、外した枚数 */
  count: number | null
  /** 重複を除いた理由 */
  reasons: FileRejection[]
}

export function rejectionNotice(picked: number, codes: readonly FileRejection[]): RejectionNotice {
  return {
    count: picked > 1 && codes.length > 0 ? codes.length : null,
    reasons: [...new Set(codes)],
  }
}

/** 全体の進み（0〜100）。送れた枚数と、いま送っている写真の割合（0〜100）から求める */
export function overallPercent(sent: number, total: number, currentPercent: number): number {
  if (total <= 0) return 0
  const value = ((sent + Math.min(100, Math.max(0, currentPercent)) / 100) / total) * 100
  return Math.min(100, Math.round(value))
}

/** 外したあとにフォーカスを移す先。次の写真の「外す」ボタンの位置か、なければ選ぶボタン */
export function focusAfterRemove(remainingCount: number, removedIndex: number): number | 'choose' {
  return removedIndex < remainingCount ? removedIndex : 'choose'
}

export type QueueAction =
  | { type: 'add'; items: readonly QueueItem[]; limit: number }
  | { type: 'remove'; id: string }
  | { type: 'status'; id: string; status: ItemStatus }
  /** 送信の開始。送れていない写真（失敗したものも）をすべて送信待ちにする */
  | { type: 'begin' }
  /** 送信の終わり。失敗した写真だけを残す */
  | { type: 'keepFailed' }
  /** 送信の中断（画面遷移）。送信中の写真を送信待ちに戻す */
  | { type: 'interrupt' }
  /** 続けての失敗で送るのをやめたとき。送信待ちの写真をまとめて失敗にする */
  | { type: 'failWaiting' }
  | { type: 'reset' }

export function queueReducer(
  items: readonly QueueItem[],
  action: QueueAction,
): readonly QueueItem[] {
  switch (action.type) {
    case 'add': {
      const room = Math.max(0, action.limit - pendingCount(items))
      const added = action.items.slice(0, room)
      if (added.length === 0) return items
      // 失敗した写真は、新しく加えた時点で送り直す対象に戻す
      return [
        ...items.map((item) =>
          item.status === 'failed' ? { ...item, status: 'waiting' as const } : item,
        ),
        ...added,
      ]
    }
    case 'remove':
      return items.filter((item) => item.id !== action.id)
    case 'status':
      return items.map((item) =>
        item.id === action.id ? { ...item, status: action.status } : item,
      )
    case 'begin':
      return items.map((item) =>
        item.status === 'sent' ? item : { ...item, status: 'waiting' as const },
      )
    case 'keepFailed':
      return items.filter((item) => item.status === 'failed')
    case 'interrupt':
      return items.map((item) =>
        item.status === 'sending' ? { ...item, status: 'waiting' as const } : item,
      )
    case 'failWaiting':
      return items.map((item) =>
        item.status === 'waiting' ? { ...item, status: 'failed' as const } : item,
      )
    case 'reset':
      return []
  }
}
