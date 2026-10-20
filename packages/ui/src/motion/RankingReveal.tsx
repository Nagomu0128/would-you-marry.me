import { m, useReducedMotion } from 'motion/react'
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from 'react'
import { RANKING_ITEM_DURATION, RANKING_STEP } from './durations'
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

// ランキングの登場演出のコンテナ。3 位 → 2 位 → 1 位（王冠）→ 4 位以下の順に登場させる
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
  const total = restDelay + RANKING_ITEM_DURATION

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

export type RankingRevealItemProps = {
  /** 順位（1 始まり） */
  rank: number
  className?: string
  as?: 'li' | 'div'
  /** 1 位の王冠の位置の調整 */
  crownClassName?: string
  crownStyle?: CSSProperties
  children: ReactNode
}

// 1 位の項目に載る王冠。登場のあとに上から降りる
function Crown({
  reduced,
  delay,
  className,
  style,
}: {
  reduced: boolean
  delay: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <m.div
      data-testid="crown"
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', top: -18, left: 8, zIndex: 1, ...style }}
      initial={reduced ? { opacity: 0 } : { y: -16, opacity: 0 }}
      animate={reduced ? { opacity: 1 } : { y: 0, opacity: 1 }}
      transition={{
        delay: reduced ? 0 : delay + 0.35,
        duration: reduced ? 0.2 : 0.4,
        ease: 'easeOut',
      }}
    >
      <svg viewBox="0 0 32 24" width={32} aria-hidden="true" focusable="false">
        <path
          d="M3 20 L1 6 L9 12 L16 2 L23 12 L31 6 L29 20 Z"
          style={{
            fill: 'var(--color-champagne)',
            stroke: 'var(--color-deep-gold)',
            strokeWidth: 1.5,
            strokeLinejoin: 'round',
          }}
        />
      </svg>
    </m.div>
  )
}

// 順位から登場の遅延が決まる。どこに置いても順番は変わらない
export function RankingRevealItem({
  rank,
  className,
  as = 'div',
  crownClassName,
  crownStyle,
  children,
}: RankingRevealItemProps) {
  const ctx = useContext(RevealContext)
  if (!ctx) throw new Error('RankingRevealItem は RankingReveal の中に置いてください')
  const { topCount, restDelay, reduced } = ctx

  const delay = reduced ? 0 : rank <= TOP ? (topCount - rank) * RANKING_STEP : restDelay
  const Item = as === 'li' ? m.li : m.div

  return (
    <Item
      data-testid="ranking-item"
      data-delay={delay}
      className={className}
      style={{ position: 'relative' }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay,
        duration: reduced ? 0.2 : RANKING_ITEM_DURATION,
        ease: 'easeOut',
      }}
    >
      {rank === 1 && (
        <Crown reduced={reduced} delay={delay} className={crownClassName} style={crownStyle} />
      )}
      {children}
    </Item>
  )
}
