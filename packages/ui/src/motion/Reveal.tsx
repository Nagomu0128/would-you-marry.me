import { m } from 'motion/react'
import type { ReactNode } from 'react'

export type RevealProps = {
  children: ReactNode
  className?: string
  /** 同じ段の中で順に立ち上げるときの遅れ（秒） */
  delay?: number
  /** 外側の要素。既定は div */
  as?: 'div' | 'section' | 'li'
}

/**
 * 初めて画面に入ったときに一度だけ立ち上がる。ホームの各段などに使う。
 * 動きを減らす設定では MotionConfig により移動をやめ、フェードだけになる。
 */
export function Reveal({ children, className, delay = 0, as = 'div' }: RevealProps) {
  const Component = as === 'section' ? m.section : as === 'li' ? m.li : m.div
  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ delay, duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </Component>
  )
}
