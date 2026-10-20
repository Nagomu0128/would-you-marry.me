import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { DURATION, PAGE_TRANSITION_OFFSET } from './constants'

export type PageTransitionProps = {
  children: ReactNode
  className?: string
}

/**
 * 画面の切り替え。フェードしながら 8px 上へ（250ms）。
 * ルートごとに `key` を変えて使う。動きを減らす設定のときは、移動をやめてフェードだけになる。
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: PAGE_TRANSITION_OFFSET }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal, ease: 'easeOut' }}
    >
      {children}
    </m.div>
  )
}
