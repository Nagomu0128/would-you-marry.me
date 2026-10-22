import { domAnimation, LazyMotion, MotionConfig } from 'motion/react'
import { type ReactNode, useEffect } from 'react'
import { watchKinSheen } from './kin-sheen'

/** 端末の「動きを減らす」設定に従う（NFR-26、ADR-0002） */
export const REDUCED_MOTION_MODE = 'user'

/**
 * Motion の土台。アプリのルートで 1 回だけ包む。
 * `LazyMotion` で必要な機能だけを読み込み、部品は `m` コンポーネントを使う。
 * `reducedMotion="user"` により、動きを減らす設定のときは移動・拡大をやめてフェードだけになる。
 * 金のきらめき（.wa-kin-sheen）が画面の外にある間は止める見張りもここで始める。
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  useEffect(() => watchKinSheen(), [])
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={REDUCED_MOTION_MODE}>{children}</MotionConfig>
    </LazyMotion>
  )
}
