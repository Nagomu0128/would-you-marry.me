import type { CSSProperties } from 'react'
import { DrawnKnot } from '../motion/DrawnKnot'

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
 * 引っ張っている間・更新中に、ヘッダーの下に出す小さな和紙の札（文言はなし）。
 * 引くほど水引の線が描かれ、更新が始まる距離を越えると結ばれる（金の輪が一度ひらく）。
 * 更新中は、結んではほどく線を繰り返す。動かすのは transform と opacity、線の描画だけ。
 * 動きを減らす設定では位置を動かさず、出し入れだけにする（線は指の動きに合わせて描く）。
 */
export function PullIndicator({ distance, refreshing }: PullIndicatorProps) {
  const visible = refreshing || distance > 0
  const reduced = prefersReducedMotion()
  const progress = refreshing ? 1 : Math.min(distance / PULL_TRIGGER, 1)
  const offset = reduced ? 0 : refreshing ? PULL_TRIGGER / 2 : distance / 2
  const state = refreshing ? 'refreshing' : progress >= 1 ? 'tied' : 'pulling'
  // 1 で何も描かれず、0 で結び終わる（DrawnKnot）
  const draw = { '--wa-knot-draw': 1 - progress } as CSSProperties
  return (
    <div
      aria-hidden="true"
      data-testid="pull-indicator"
      className="pointer-events-none relative h-0"
    >
      <div
        className="absolute inset-x-0 top-0 flex justify-center"
        style={{
          opacity: visible ? Math.min(progress * 1.5, 1) : 0,
          transform: `translateY(${offset}px)`,
        }}
      >
        <span className="wa-pull" data-state={state} style={draw}>
          <DrawnKnot strands="bold" />
        </span>
      </div>
    </div>
  )
}
