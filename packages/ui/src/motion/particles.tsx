import { m } from 'motion/react'
import { WeddingMark } from './WeddingMark'

// Stable placement keeps decorations identical across server and client renders.
export function seeded(i: number, salt = 1): number {
  const x = Math.sin((i + 1) * 12.9898 * salt) * 43758.5453
  return x - Math.floor(x)
}

/** Paired olive sprigs unfold gently; count is capped to keep the composition quiet. */
export function Petals({
  count,
  maxDelay,
  duration,
}: {
  count: number
  maxDelay: number
  duration: number
}) {
  return (
    <>
      {['left', 'right'].slice(0, count).map((side, i) => (
        <m.svg
          key={side}
          className="wedding-botanical"
          data-side={side}
          viewBox="0 0 50 108"
          width={50}
          height={108}
          aria-hidden="true"
          focusable="false"
          initial={{ opacity: 0, y: 12, rotate: i === 0 ? -10 : 10 }}
          animate={{ opacity: 0.4, y: 0, rotate: 0 }}
          transition={{ delay: i * maxDelay, duration, ease: 'easeOut' }}
        >
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            transform={i === 1 ? 'translate(50 0) scale(-1 1)' : undefined}
          >
            <path d="M36 104C12 75 11 40 28 8" />
            <path d="M22 23C11 23 8 13 10 8C19 10 23 15 22 23ZM17 43C4 40 2 30 4 25C14 29 18 35 17 43ZM17 65C4 61 1 51 4 46C14 49 18 57 17 65ZM24 85C10 83 6 74 7 68C19 71 24 78 24 85ZM19 35C31 34 38 24 37 18C25 20 20 26 19 35ZM16 56C30 53 36 44 33 38C23 41 18 48 16 56ZM20 76C33 71 37 62 33 57C23 62 20 68 20 76Z" />
          </g>
        </m.svg>
      ))}
    </>
  )
}

/** Kept as an internal compatibility alias; celebration now uses botanical linework. */
export function Confetti({
  count,
  duration,
}: {
  count: number
  duration: number
  originY?: string
}) {
  return <Petals count={count} maxDelay={0.15} duration={Math.min(duration, 1.6)} />
}

export function Rings({ delay = 0.15 }: { delay?: number }) {
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, duration: 0.8, ease: 'easeOut' }}
    >
      <WeddingMark />
    </m.div>
  )
}
