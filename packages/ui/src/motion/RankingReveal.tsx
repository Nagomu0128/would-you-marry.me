import { m, useReducedMotion } from 'motion/react'
import { type ReactNode, useEffect } from 'react'
import { RANKING_ITEM_DURATION, RANKING_STEP } from './durations'
import { useCompleteOnce } from './use-complete-once'

export type RankingRevealProps = {
  /** 1 位から順の項目（写真カードなど） */
  items: ReactNode[]
  onComplete?: () => void
}

const TOP = 3

// 1 位の項目に載る王冠。登場のあとに上から降りる
function Crown({ reduced, delay }: { reduced: boolean; delay: number }) {
  return (
    <m.div
      data-testid="crown"
      aria-hidden="true"
      style={{ position: 'absolute', top: -18, left: 8, zIndex: 1 }}
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

// ランキングの登場演出。3 位 → 2 位 → 1 位（王冠）→ 4 位以下の順
export function RankingReveal({ items, onComplete }: RankingRevealProps) {
  const reduced = !!useReducedMotion()
  const { complete } = useCompleteOnce(onComplete)

  const topCount = Math.min(TOP, items.length)
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

  return (
    <ol
      data-testid="ranking-reveal"
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 16 }}
    >
      {items.map((item, index) => {
        // 3 位が最初、1 位が最後。4 位以下はそのあとまとめて
        const delay = reduced ? 0 : index < TOP ? (topCount - 1 - index) * RANKING_STEP : restDelay
        return (
          <m.li
            // biome-ignore lint/suspicious/noArrayIndexKey: 順位が識別子
            key={index}
            data-testid="ranking-item"
            style={{ position: 'relative' }}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            transition={{
              delay,
              duration: reduced ? 0.2 : RANKING_ITEM_DURATION,
              ease: 'easeOut',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                fontFamily: 'var(--font-accent)',
                fontSize: 20,
                color: 'var(--color-deep-gold)',
              }}
            >
              {index + 1}
            </span>
            {index === 0 && <Crown reduced={reduced} delay={delay} />}
            {item}
          </m.li>
        )
      })}
    </ol>
  )
}
