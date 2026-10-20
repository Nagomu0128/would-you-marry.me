import { domAnimation, LazyMotion, MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'

/** 端末の「動きを減らす」設定に従う（NFR-26、ADR-0002） */
export const REDUCED_MOTION_MODE = 'user'

/**
 * Motion の土台。アプリのルートで 1 回だけ包む。
 * `LazyMotion` で必要な機能だけを読み込み、部品は `m` コンポーネントを使う。
 * `reducedMotion="user"` により、動きを減らす設定のときは移動・拡大をやめてフェードだけになる。
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={REDUCED_MOTION_MODE}>{children}</MotionConfig>
    </LazyMotion>
  )
}
