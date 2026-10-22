import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { PAGE_TRANSITION_DURATION } from '../motion/durations'
import { PAGE_TRANSITION_OFFSET } from './constants'

export type PageTransitionProps = {
  children: ReactNode
  className?: string
}

const EASE_WA = [0.22, 0.61, 0.36, 1] as const

/**
 * 画面の切り替え。紙を一枚送るように、新しい画面が少し下から入って落ち着く（0.34 秒）。
 * 不透明度は先に（0.2 秒）上がり、位置は遅れて止まる。2 つの速さをずらして、紙の重さを出す。
 * ルートごとに `key` を変えて使う。動きを減らす設定のときは、移動をやめてフェードだけになる（MotionConfig）。
 * 中に position: fixed の演出が入ることがあるので、clip-path や mask では切り抜かない。
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: PAGE_TRANSITION_OFFSET }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        y: { duration: PAGE_TRANSITION_DURATION, ease: EASE_WA },
        opacity: { duration: 0.2, ease: 'easeOut' },
      }}
    >
      {children}
    </m.div>
  )
}
