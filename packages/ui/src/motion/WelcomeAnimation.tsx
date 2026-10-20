import { m } from 'motion/react'
import { WELCOME_DURATION } from './durations'
import { FullscreenStage, paperBackground } from './FullscreenStage'
import { Petals, Rings } from './particles'

export type WelcomeAnimationProps = {
  tenantName: string
  onComplete: () => void
  /** タップで飛ばせることを伝える読み上げ用ラベル */
  skipLabel?: string
}

// ニックネーム登録直後のホームで再生するウェルカム演出（2〜3 秒）
export function WelcomeAnimation({ tenantName, onComplete, skipLabel }: WelcomeAnimationProps) {
  return (
    <FullscreenStage duration={WELCOME_DURATION} onComplete={onComplete} skipLabel={skipLabel}>
      <m.div
        style={paperBackground}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: WELCOME_DURATION, times: [0, 0.12, 0.85, 1] }}
      />
      <m.div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: WELCOME_DURATION, times: [0, 0.2, 0.85, 1] }}
      >
        <Rings />
        <p style={{ fontFamily: 'var(--font-accent)', fontSize: 28, margin: 0 }}>{tenantName}</p>
      </m.div>
      <Petals count={14} maxDelay={0.6} duration={2} />
    </FullscreenStage>
  )
}
