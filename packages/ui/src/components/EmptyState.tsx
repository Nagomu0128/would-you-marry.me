import type { ReactNode } from 'react'
import { MizuhikiKnot } from '../ornaments/MizuhikiKnot'
import { Orizuru } from '../ornaments/Orizuru'
import { cn } from './cn'

export type EmptyStateProps = {
  /** 画面ごとの空の文言（messages の `*.empty`） */
  message: string
  /**
   * 文言の上に添える小さな絵。既定は折り鶴。`'mizuhiki'` で水引、任意の要素も渡せる。
   * 絵は装飾なので読み上げない
   */
  ornament?: 'orizuru' | 'mizuhiki' | ReactNode
  /** @deprecated `ornament` を使う */
  icon?: ReactNode
  /** 文言の下に置く操作（ボタンなど） */
  action?: ReactNode
  className?: string
}

/** 0 件のときの表示。箱で囲まず、紙の上に小さな折り鶴（または水引）と短い言葉を置く。 */
export function EmptyState({ message, ornament, icon, action, className }: EmptyStateProps) {
  const art = ornament ?? icon ?? 'orizuru'
  return (
    <div className={cn('empty-state', className)}>
      <div className="empty-art" aria-hidden="true">
        {art === 'orizuru' ? (
          <Orizuru tone="kinu" className="empty-orizuru" />
        ) : art === 'mizuhiki' ? (
          <MizuhikiKnot strands="three" className="empty-knot" />
        ) : (
          art
        )}
      </div>
      <p className="empty-message">{message}</p>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  )
}
