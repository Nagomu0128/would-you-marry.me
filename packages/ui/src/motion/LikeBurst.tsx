import { m, useReducedMotion } from 'motion/react'
import { useEffect } from 'react'
import { LIKE_BURST_DURATION } from './durations'
import { useCompleteOnce } from './use-complete-once'

export type LikeBurstProps = {
  /** true になるたびに再生する（いいねしたとき）。取り消し（false）では何も出さない */
  active: boolean
  onComplete?: () => void
}

const GRAINS = 8

// いいねボタンの上に重ねて使う、ハートの弾みと粒の広がり
export function LikeBurst({ active, onComplete }: LikeBurstProps) {
  const reduced = useReducedMotion()
  const { complete, reset } = useCompleteOnce(onComplete)

  useEffect(() => {
    if (!active) {
      reset()
      return
    }
    if (reduced) {
      complete()
      return
    }
    const timer = setTimeout(complete, LIKE_BURST_DURATION * 1000)
    return () => clearTimeout(timer)
  }, [active, reduced, complete, reset])

  if (!active || reduced) return null

  const heartDuration = LIKE_BURST_DURATION - 0.1

  return (
    <div
      data-testid="like-burst"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {Array.from({ length: GRAINS }, (_, i) => {
        const angle = (i / GRAINS) * Math.PI * 2
        return (
          <m.span
            // biome-ignore lint/suspicious/noArrayIndexKey: 固定の装飾
            key={i}
            data-testid="like-grain"
            style={{
              position: 'absolute',
              width: 5,
              height: 5,
              borderRadius: '50%',
              backgroundColor: i % 2 === 0 ? 'var(--color-rose)' : 'var(--color-champagne)',
            }}
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
            animate={{
              x: Math.cos(angle) * 26,
              y: Math.sin(angle) * 26,
              scale: [0.4, 1, 0.3],
              opacity: [0, 1, 0],
            }}
            transition={{ delay: 0.08, duration: 0.6, ease: 'easeOut' }}
          />
        )
      })}
      <m.svg
        viewBox="0 0 24 24"
        width={28}
        height={28}
        focusable="false"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 1.35, 1], opacity: [0, 1, 1, 0] }}
        transition={{
          scale: { duration: 0.45, times: [0, 0.6, 1], ease: 'easeOut' },
          opacity: { duration: heartDuration, times: [0, 0.1, 0.7, 1] },
        }}
      >
        <path
          d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.8 4.8 6.3 4.8c2 0 3.8 1.1 5.7 3.3 1.9-2.2 3.7-3.3 5.7-3.3 3.5 0 5.4 3.6 3.9 7C19.5 16.4 12 21 12 21Z"
          style={{ fill: 'var(--color-rose)' }}
        />
      </m.svg>
    </div>
  )
}
