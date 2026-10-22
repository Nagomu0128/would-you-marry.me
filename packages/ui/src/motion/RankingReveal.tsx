import { type MotionStyle, m, type TargetAndTransition, useReducedMotion } from 'motion/react'
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from 'react'
import { DrawnKnot } from './DrawnKnot'
import { RANKING_FIRST_FLOURISH, RANKING_ITEM_DURATION, RANKING_STEP } from './durations'
import { useCompleteOnce } from './use-complete-once'

const TOP = 3

type RevealContextValue = { topCount: number; restDelay: number; reduced: boolean }

const RevealContext = createContext<RevealContextValue | null>(null)

export type RankingRevealProps = {
  /** 項目の数（登場の時間の計算に使う） */
  count: number
  onComplete?: () => void
  className?: string
  as?: 'ol' | 'div'
  /** 配置は呼び出し側が決める。各項目は RankingRevealItem で包む */
  children: ReactNode
}

/**
 * ランキングの登場演出のコンテナ。3 位 → 2 位 → 1 位 → 4 位以下の順に、紙焼き写真を置くように登場させる。
 * 1 位は最後に置かれ、続いて金の額縁に光が一度走り（.wa-rank-sheen）、水引の飾りが結ばれる。
 * 各項目は CSS 変数 --ranking-delay（登場の遅れ）を持ち、micro.css の
 * .wa-rank-numeral（順位の数字が立ち上がる）・.wa-rank-sheen（額縁の光）がそれに合わせて動く。
 */
export function RankingReveal({
  count,
  onComplete,
  className,
  as: Tag = 'div',
  children,
}: RankingRevealProps) {
  const reduced = !!useReducedMotion()
  const { complete } = useCompleteOnce(onComplete)

  const topCount = Math.min(TOP, count)
  const restDelay = topCount * RANKING_STEP + 0.1
  const firstDelay = Math.max(0, topCount - 1) * RANKING_STEP
  const total = Math.max(
    restDelay + RANKING_ITEM_DURATION,
    count > 0 ? firstDelay + RANKING_FIRST_FLOURISH : 0,
  )

  useEffect(() => {
    if (reduced) {
      complete()
      return
    }
    const timer = setTimeout(complete, total * 1000)
    return () => clearTimeout(timer)
  }, [reduced, total, complete])

  const value = useMemo(() => ({ topCount, restDelay, reduced }), [topCount, restDelay, reduced])

  return (
    <RevealContext.Provider value={value}>
      <Tag data-testid="ranking-reveal" className={className}>
        {children}
      </Tag>
    </RevealContext.Provider>
  )
}

export type RankingRevealKnotProps = {
  className?: string
  style?: CSSProperties
}

/**
 * 1 位の水引の飾り。1 位が置かれたあとに線が描かれて結ばれる（micro.css の .wa-rank-knot）。
 * RankingRevealItem（rank=1）が自動で載せる。額縁の中など別の場所に置くときは、
 * RankingRevealItem に crown={false} を渡し、1 位の項目の中にこれを置く。
 * 交差の切れ目は背景色で描くので、置く面の色を CSS の --knot-gap に渡す（既定は surface）。
 */
export function RankingRevealKnot({ className, style }: RankingRevealKnotProps) {
  return (
    <span
      data-testid="crown"
      aria-hidden="true"
      className={['wa-rank-knot', className].filter(Boolean).join(' ')}
      style={style}
    >
      <DrawnKnot strands="three" />
    </span>
  )
}

export type RankingRevealItemProps = {
  /** 順位（1 始まり） */
  rank: number
  className?: string
  as?: 'li' | 'div'
  /** 1 位の水引の飾りの位置の調整 */
  crownClassName?: string
  crownStyle?: CSSProperties
  /** 1 位に水引の飾りを自動で載せる（既定 true）。false なら RankingRevealKnot を自分で置く */
  crown?: boolean
  children: ReactNode
}

// 置かれる前の姿勢。2・3 位は紙焼きを置くように少し傾けて、落ち着かせる
function entranceFrom(rank: number): TargetAndTransition {
  if (rank === 1) return { opacity: 0, y: 28, scale: 0.96 }
  if (rank === 2) return { opacity: 0, y: 20, rotate: -1.6, scale: 0.98 }
  if (rank === 3) return { opacity: 0, y: 20, rotate: 1.6, scale: 0.98 }
  return { opacity: 0, y: 12 }
}

// 順位から登場の遅延が決まる。どこに置いても順番は変わらない
export function RankingRevealItem({
  rank,
  className,
  as = 'div',
  crownClassName,
  crownStyle,
  crown = true,
  children,
}: RankingRevealItemProps) {
  const ctx = useContext(RevealContext)
  if (!ctx) throw new Error('RankingRevealItem は RankingReveal の中に置いてください')
  const { topCount, restDelay, reduced } = ctx

  const delay = reduced ? 0 : rank <= TOP ? (topCount - rank) * RANKING_STEP : restDelay
  const Item = as === 'li' ? m.li : m.div
  // CSS の演出（数字・額縁の光・水引）が同じ時刻に合わせるための変数
  const style = { position: 'relative', '--ranking-delay': `${delay}s` } as MotionStyle

  return (
    <Item
      data-testid="ranking-item"
      data-rank={rank}
      data-delay={delay}
      className={className}
      style={style}
      initial={reduced ? false : entranceFrom(rank)}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, rotate: 0, scale: 1 }}
      transition={
        reduced
          ? { duration: 0 }
          : {
              type: 'spring',
              bounce: 0.2,
              duration: RANKING_ITEM_DURATION,
              delay,
              opacity: { type: 'tween', delay, duration: 0.3, ease: 'easeOut' },
            }
      }
    >
      {rank === 1 && crown ? (
        <RankingRevealKnot
          {...(crownClassName ? { className: crownClassName } : {})}
          {...(crownStyle ? { style: crownStyle } : {})}
        />
      ) : null}
      {children}
    </Item>
  )
}
