import { m } from 'motion/react'
import { UPLOAD_COMPLETE_DURATION } from './durations'
import { FullscreenStage } from './FullscreenStage'

export type UploadCompleteProps = {
  onComplete: () => void
  /** タップで飛ばせることを伝えるラベル */
  skipLabel: string
}

export function UploadComplete({ onComplete, skipLabel }: UploadCompleteProps) {
  return (
    <FullscreenStage
      duration={UPLOAD_COMPLETE_DURATION}
      onComplete={onComplete}
      skipLabel={skipLabel}
    >
      <div className="wedding-scene">
        <p className="wedding-eyebrow">A moment, kept forever.</p>
        <m.svg
          viewBox="0 0 112 112"
          width={112}
          height={112}
          className="wedding-seal"
          aria-hidden="true"
          focusable="false"
          initial={{ opacity: 0, scale: 1.15, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <circle cx="56" cy="56" r="44" />
          <circle cx="56" cy="56" r="38" strokeDasharray="1 5" />
          <path d="M31 82L24 103L36 98L43 108L49 89M81 82L88 103L76 98L69 108L63 89" />
          <m.path
            d="M39 56L51 68L75 43"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.3, duration: 0.45, ease: 'easeOut' }}
          />
        </m.svg>
        <span className="wedding-rule" aria-hidden="true" />
      </div>
    </FullscreenStage>
  )
}
