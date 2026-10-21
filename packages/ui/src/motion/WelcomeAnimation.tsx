import { m } from 'motion/react'
import { WELCOME_DURATION } from './durations'
import { FullscreenStage } from './FullscreenStage'
import { Rings } from './particles'

export type WelcomeAnimationProps = {
  tenantName: string
  onComplete: () => void
  /** タップで飛ばせることを伝えるラベル */
  skipLabel: string
}

export function WelcomeAnimation({ tenantName, onComplete, skipLabel }: WelcomeAnimationProps) {
  return (
    <FullscreenStage duration={WELCOME_DURATION} onComplete={onComplete} skipLabel={skipLabel}>
      <div className="wedding-scene">
        <p className="wedding-eyebrow">A day to remember</p>
        <Rings />
        <m.p
          className="wedding-name"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          {tenantName}
        </m.p>
        <span className="wedding-rule" aria-hidden="true" />
      </div>
    </FullscreenStage>
  )
}
