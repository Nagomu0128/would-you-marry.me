import { m } from 'motion/react'
import type { CSSProperties } from 'react'

// 見た目が毎回ばらつかないよう、疑似乱数は添字から決める
export function seeded(i: number, salt = 1): number {
  const x = Math.sin((i + 1) * 12.9898 * salt) * 43758.5453
  return x - Math.floor(x)
}

const PETAL_COLORS = ['var(--color-rose)', 'var(--color-champagne)'] as const
const CONFETTI_COLORS = [
  'var(--color-champagne)',
  'var(--color-rose)',
  'var(--color-deep-gold)',
] as const

// 画面の上から舞い降りる花びら。maxDelay + duration は演出の長さに収まる値にする
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
      {Array.from({ length: count }, (_, i) => {
        const left = 4 + seeded(i) * 92
        const sway = 16 + seeded(i, 2) * 28
        const dir = i % 2 === 0 ? 1 : -1
        const size = 14 + seeded(i, 3) * 12
        const d = duration * (0.8 + seeded(i, 4) * 0.2)
        const color = PETAL_COLORS[i % PETAL_COLORS.length] ?? 'var(--color-rose)'
        return (
          <m.div
            // biome-ignore lint/suspicious/noArrayIndexKey: 固定の装飾
            key={i}
            data-testid="petal"
            style={{ position: 'absolute', top: 0, left: `${left}%`, width: size }}
            initial={{ y: '-10vh', x: 0, rotate: 0, opacity: 0 }}
            animate={{
              y: '105vh',
              x: [0, sway * dir, -sway * dir],
              rotate: 300 * dir,
              opacity: [0, 0.9, 0.9, 0],
            }}
            transition={{
              delay: seeded(i, 5) * maxDelay,
              y: { duration: d, ease: 'linear' },
              x: { duration: d, ease: 'easeInOut' },
              rotate: { duration: d, ease: 'linear' },
              opacity: { duration: d, times: [0, 0.15, 0.8, 1] },
            }}
          >
            <svg viewBox="0 0 20 28" width="100%" aria-hidden="true" focusable="false">
              <path d="M10 0C17 8 20 17 10 28C0 17 3 8 10 0Z" style={{ fill: color }} />
            </svg>
          </m.div>
        )
      })}
    </>
  )
}

// 紙吹雪。中心から弾けて落ちる
export function Confetti({
  count,
  duration,
  originY = '45%',
}: {
  count: number
  duration: number
  originY?: string
}) {
  const span = duration - 0.9
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + seeded(i) * 0.5
        const reach = 90 + seeded(i, 2) * 90
        const w = 6 + seeded(i, 3) * 6
        return (
          <m.span
            // biome-ignore lint/suspicious/noArrayIndexKey: 固定の装飾
            key={i}
            data-testid="confetti"
            style={{
              position: 'absolute',
              left: '50%',
              top: originY,
              width: w,
              height: w * 1.6,
              borderRadius: 1,
              backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 0 }}
            animate={{
              x: Math.cos(angle) * reach,
              y: [0, Math.sin(angle) * reach - 40, Math.sin(angle) * reach + 120],
              rotate: (i % 2 === 0 ? 1 : -1) * 360,
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              delay: 0.5 + seeded(i, 4) * 0.2,
              duration: span,
              ease: 'easeOut',
              opacity: { duration: span, times: [0, 0.1, 0.7, 1] },
            }}
          />
        )
      })}
    </>
  )
}

// 重なる 2 つのリング。左右から寄ってきて重なる
export function Rings({ delay = 0.3 }: { delay?: number }) {
  const stroke: CSSProperties = {
    fill: 'none',
    stroke: 'var(--color-champagne)',
    strokeWidth: 3,
  }
  return (
    <svg viewBox="0 0 120 70" width={150} aria-hidden="true" focusable="false">
      <m.circle
        cx={45}
        cy={35}
        r={22}
        style={stroke}
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay, duration: 0.8, ease: 'easeOut' }}
      />
      <m.circle
        cx={75}
        cy={35}
        r={22}
        style={{ ...stroke, stroke: 'var(--color-deep-gold)' }}
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay, duration: 0.8, ease: 'easeOut' }}
      />
    </svg>
  )
}
