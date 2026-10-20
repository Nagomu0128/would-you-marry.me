import { RefreshCw } from 'lucide-react'
import { ICON_STROKE_WIDTH } from './constants'

/** 更新を始める引っ張りの距離（px、指の移動量の半分） */
export const PULL_TRIGGER = 56

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export type PullIndicatorProps = {
  /** 引っ張っている量（px） */
  distance: number
  /** 更新中 */
  refreshing: boolean
}

/**
 * 引っ張っている間・更新中に、ヘッダーの下に出すアイコン（文言はなし）。
 * 動かすのは transform と opacity だけ。動きを減らす設定では位置を動かさず、出し入れだけにする。
 */
export function PullIndicator({ distance, refreshing }: PullIndicatorProps) {
  const visible = refreshing || distance > 0
  const reduced = prefersReducedMotion()
  const progress = refreshing ? 1 : Math.min(distance / PULL_TRIGGER, 1)
  const offset = reduced ? 0 : refreshing ? PULL_TRIGGER / 2 : distance / 2
  return (
    <div
      aria-hidden="true"
      data-testid="pull-indicator"
      className="pointer-events-none relative h-0"
    >
      <div
        className="absolute inset-x-0 top-0 flex justify-center"
        style={{
          opacity: visible ? progress : 0,
          transform: `translateY(${offset}px)`,
        }}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-surface text-champagne shadow-card">
          <RefreshCw
            size={16}
            strokeWidth={ICON_STROKE_WIDTH}
            className={refreshing ? 'animate-pulse motion-reduce:animate-none' : undefined}
            style={reduced ? undefined : { transform: `rotate(${progress * 180}deg)` }}
          />
        </span>
      </div>
    </div>
  )
}
