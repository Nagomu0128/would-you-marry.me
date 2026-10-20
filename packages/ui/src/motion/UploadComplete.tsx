import { m } from 'motion/react'
import type { CSSProperties } from 'react'
import { UPLOAD_COMPLETE_DURATION } from './durations'
import { FullscreenStage } from './FullscreenStage'
import { Confetti } from './particles'

export type UploadCompleteProps = {
  onComplete: () => void
  /** タップで飛ばせることを伝える読み上げ用ラベル */
  skipLabel: string
}

const stroke: CSSProperties = {
  fill: 'none',
  stroke: 'var(--color-champagne)',
  strokeWidth: 4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

// アップロード完了。チェックマークが描かれ、紙吹雪が少し舞う
export function UploadComplete({ onComplete, skipLabel }: UploadCompleteProps) {
  const total = UPLOAD_COMPLETE_DURATION
  return (
    <FullscreenStage duration={total} onComplete={onComplete} skipLabel={skipLabel}>
      <m.div
        style={{ position: 'absolute', inset: 0, backgroundColor: 'var(--color-ivory)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.92, 0.92, 0] }}
        transition={{ duration: total, times: [0, 0.1, 0.8, 1] }}
      />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '45%',
          width: 96,
          marginLeft: -48,
          marginTop: -48,
        }}
      >
        <m.svg
          viewBox="0 0 96 96"
          width="100%"
          aria-hidden="true"
          focusable="false"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.9, 1, 1, 1] }}
          transition={{ duration: total, times: [0, 0.12, 0.8, 1] }}
        >
          <m.circle
            cx={48}
            cy={48}
            r={42}
            style={stroke}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
          <m.path
            d="M28 50 L43 64 L69 34"
            style={{ ...stroke, stroke: 'var(--color-deep-gold)' }}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.5, duration: 0.5, ease: 'easeOut' }}
          />
        </m.svg>
      </div>
      <Confetti count={14} duration={total} />
    </FullscreenStage>
  )
}
