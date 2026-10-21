import { cn } from './cn'

export type SkeletonProps = {
  /** 大きさと形（`h-4 w-1/2` など）。内容の形に合わせる */
  className?: string
}

/** 読み込み中の、内容の形をした薄いブロック。くるくる回る表示は使わない。 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="skeleton"
      className={cn(
        'animate-pulse rounded-control bg-rule/70 motion-reduce:animate-none',
        className,
      )}
    />
  )
}
