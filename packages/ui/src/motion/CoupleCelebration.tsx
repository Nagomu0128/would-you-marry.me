import { m } from 'motion/react'
import { COUPLE_CELEBRATION_DURATION } from './durations'
import { FullscreenStage } from './FullscreenStage'
import { Petals, Rings } from './particles'

export type CoupleCelebrationProps = {
  tenantName: string
  onComplete: () => void
  /** タップで飛ばせることを伝えるラベル */
  skipLabel: string
}

export function CoupleCelebration({ tenantName, onComplete, skipLabel }: CoupleCelebrationProps) {
  return (
    <FullscreenStage
      duration={COUPLE_CELEBRATION_DURATION}
      onComplete={onComplete}
      skipLabel={skipLabel}
    >
      <div className="wedding-scene">
        <p className="wedding-eyebrow">With love, always.</p>
        <Rings delay={0.15} />
        <m.p
          className="wedding-name"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          {tenantName}
        </m.p>
        <span className="wedding-rule" aria-hidden="true" />
      </div>
      <Petals count={2} maxDelay={0.2} duration={1.6} />
    </FullscreenStage>
  )
}
