import { m } from 'motion/react'
import { COUPLE_CELEBRATION_DURATION } from './durations'
import { FullscreenStage, paperBackground } from './FullscreenStage'
import { Petals, Rings, seeded } from './particles'

export type CoupleCelebrationProps = {
  tenantName: string
  onComplete: () => void
  /** タップで飛ばせることを伝える読み上げ用ラベル */
  skipLabel?: string
}

const SPARKLES = 10

// 新郎新婦用ページに初めて入ったときの、二人へのお祝い（2〜3 秒）
export function CoupleCelebration({ tenantName, onComplete, skipLabel }: CoupleCelebrationProps) {
  const total = COUPLE_CELEBRATION_DURATION
  return (
    <FullscreenStage duration={total} onComplete={onComplete} skipLabel={skipLabel}>
      <m.div
        style={paperBackground}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: total, times: [0, 0.12, 0.85, 1] }}
      />
      {/* 下から昇るきらめき */}
      {Array.from({ length: SPARKLES }, (_, i) => (
        <m.span
          // biome-ignore lint/suspicious/noArrayIndexKey: 固定の装飾
          key={i}
          data-testid="sparkle"
          style={{
            position: 'absolute',
            left: `${8 + seeded(i) * 84}%`,
            bottom: 0,
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: 'var(--color-champagne)',
          }}
          initial={{ y: 0, scale: 0.4, opacity: 0 }}
          animate={{ y: '-70vh', scale: [0.4, 1.2, 0.6], opacity: [0, 1, 0] }}
          transition={{ delay: seeded(i, 2) * 0.7, duration: 1.7, ease: 'easeOut' }}
        />
      ))}
      <m.div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 24,
          textAlign: 'center',
        }}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.94, 1, 1, 1] }}
        transition={{ duration: total, times: [0, 0.2, 0.85, 1] }}
      >
        <Rings delay={0.2} />
        <p
          style={{
            fontFamily: 'var(--font-accent)',
            fontSize: 30,
            margin: 0,
            color: 'var(--color-deep-gold)',
          }}
        >
          {tenantName}
        </p>
      </m.div>
      <Petals count={8} maxDelay={0.6} duration={2} />
    </FullscreenStage>
  )
}
