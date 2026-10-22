import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { REVEAL_DURATION } from './durations'

export type RevealProps = {
  children: ReactNode
  className?: string
  /** 同じ段の中で順に立ち上げるときの遅れ（秒） */
  delay?: number
  /** 外側の要素。既定は div */
  as?: 'div' | 'section' | 'li'
}

const EASE_WA = [0.22, 0.61, 0.36, 1] as const

/**
 * 初めて画面に入ったときに一度だけ立ち上がる。ホームの各段などに使う。
 * 卓に伏せてあった紙を起こすように、下端を軸にわずかに起き上がりながら上がる。
 * 先に姿を現し（0.32 秒）、少し遅れて位置が落ち着く（0.5 秒）。
 * 段の頭が画面の下から 1 割ほど入ったところで始める。一度立ち上がったら、スクロールで戻っても繰り返さない。
 * 動きを減らす設定では MotionConfig により移動をやめ、フェードだけになる。
 */
export function Reveal({ children, className, delay = 0, as = 'div' }: RevealProps) {
  const Component = as === 'section' ? m.section : as === 'li' ? m.li : m.div
  return (
    <Component
      className={className}
      style={{ transformOrigin: '50% 100%' }}
      initial={{ opacity: 0, y: 20, rotateX: 9, transformPerspective: 900 }}
      // 立ち上がったら transform を残さない（中の position: fixed や重なりの基準を変えない）
      whileInView={{ opacity: 1, y: 0, rotateX: 0, transitionEnd: { transformPerspective: 0 } }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{
        y: { delay, duration: REVEAL_DURATION, ease: EASE_WA },
        rotateX: { delay, duration: REVEAL_DURATION, ease: EASE_WA },
        opacity: { delay, duration: 0.32, ease: 'easeOut' },
      }}
    >
      {children}
    </Component>
  )
}
