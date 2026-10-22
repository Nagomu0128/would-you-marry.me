import { cn } from './cn'

export type SkeletonProps = {
  /** 大きさと形（`h-4 w-1/2` など）。内容の形に合わせる */
  className?: string
}

/**
 * 読み込み中の、内容の形をした和紙のブロック。金を含んだ淡い光がゆっくり通る（micro.css の .wa-skeleton）。
 * くるくる回る表示は使わない。動きを減らす設定では光を止める。
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="skeleton"
      className={cn('wa-skeleton rounded-control', className)}
    />
  )
}
