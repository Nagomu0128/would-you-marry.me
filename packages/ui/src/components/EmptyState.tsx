import type { ReactNode } from 'react'
import { cn } from './cn'

export type EmptyStateProps = {
  /** 画面ごとの空の文言（messages の `*.empty`） */
  message: string
  /** 文言の上に出すアイコン（Lucide、線幅 1.5） */
  icon?: ReactNode
  /** 文言の下に置く操作（ボタンなど） */
  action?: ReactNode
  className?: string
}

/** 0 件のときの表示 */
export function EmptyState({ message, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-4 px-6 py-12 text-center', className)}>
      {icon ? <div className="text-champagne">{icon}</div> : null}
      <p className="text-body text-warm-gray">{message}</p>
      {action}
    </div>
  )
}
