import { Flower2 } from 'lucide-react'
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
    <div className={cn('empty-state', className)}>
      <div aria-hidden="true">{icon ?? <Flower2 strokeWidth={1} />}</div>
      <p className="text-body text-muted">{message}</p>
      {action}
    </div>
  )
}
