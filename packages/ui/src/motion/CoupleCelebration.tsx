import { m } from 'motion/react'
import { type CSSProperties, useState } from 'react'
import { ja } from '../messages/ja'
import { Orizuru } from '../ornaments/Orizuru'
import { COUPLE_CELEBRATION_DURATION } from './durations'
import { FullscreenStage } from './FullscreenStage'
import { PaperConfetti } from './particles'

export type CoupleCelebrationProps = {
  tenantName: string
  onComplete: () => void
  /** 飛ばすボタンのラベル */
  skipLabel: string
}

/** 鶴が舞う空の大きさ（CSS px）。画面に合わせて全体を拡大・縮小する */
const SKY_WIDTH = 360
const SKY_HEIGHT = 280

/**
 * 二羽の鶴の軌跡。左の金の鶴は左下から、右の紅の鶴は右下から舞い上がり、
 * 大きく弧を描いて降りてきて、中央で向かい合う（向かい鶴）。
 * 終点の向きは水平。x は単調に進むので、鶴が裏返らない
 */
const FLIGHTS = {
  kin: 'M-66 168C-30 148 2 90 40 90C82 90 96 140 124 140',
  beni: 'M424 156C390 136 358 80 320 80C278 80 264 140 236 140',
} as const

/**
 * 時間割（秒）。合計は COUPLE_CELEBRATION_DURATION（3.6 秒）で、最後の 0.5 秒で舞台が溶ける。
 * 舞台が暗くなる → 二羽が舞い込む → 向かい合って寄り添う → 紙吹雪 → 名前と祝いの言葉
 */
const TIMELINE = {
  kin: 0.12,
  beni: 0.24,
  flight: 1.5,
  nestle: 1.6,
  confetti: 1.62,
  names: 1.72,
  congrats: 2.08,
  note: 2.28,
} as const

/** 舞い込む鶴の進み方。勢いよく入り、降りながら速度を落として止まる */
const FLIGHT_EASE = [0.32, 0.02, 0.2, 1] as const

/** 画面の幅と高さに合わせた空の倍率 */
function skyScale(): number {
  if (typeof window === 'undefined') return 1
  return Math.min(window.innerWidth / SKY_WIDTH, (window.innerHeight * 0.46) / SKY_HEIGHT, 1.35)
}

export function CoupleCelebration({ tenantName, onComplete, skipLabel }: CoupleCelebrationProps) {
  const [scale] = useState(skyScale)

  return (
    <FullscreenStage
      duration={COUPLE_CELEBRATION_DURATION}
      onComplete={onComplete}
      skipLabel={skipLabel}
      scene="tsuru"
      fadeIn={0.25}
    >
      <div className="tsuru-sea" />
      <div className="tsuru-layout">
        <div
          className="tsuru-sky"
          style={{ inlineSize: SKY_WIDTH * scale, blockSize: SKY_HEIGHT * scale }}
        >
          <div
            className="tsuru-sky-inner"
            style={{ inlineSize: SKY_WIDTH, blockSize: SKY_HEIGHT, transform: `scale(${scale})` }}
          >
            <svg
              className="tsuru-trails"
              viewBox={`0 0 ${SKY_WIDTH} ${SKY_HEIGHT}`}
              fill="none"
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <linearGradient id="tsuru-trail-kin" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#e2c98f" stopOpacity="0" />
                  <stop offset="0.6" stopColor="#e2c98f" stopOpacity="0.55" />
                  <stop offset="1" stopColor="#f0dca6" />
                </linearGradient>
                <linearGradient id="tsuru-trail-beni" x1="1" y1="0" x2="0" y2="0">
                  <stop offset="0" stopColor="#c9343f" stopOpacity="0" />
                  <stop offset="0.6" stopColor="#c9343f" stopOpacity="0.6" />
                  <stop offset="1" stopColor="#e2c98f" />
                </linearGradient>
              </defs>
              <Trail side="kin" />
              <Trail side="beni" />
            </svg>
            <Crane side="kin" />
            <Crane side="beni" />
            <PaperConfetti
              count={32}
              delay={TIMELINE.confetti}
              seed={2}
              power={0.95}
              style={{ left: SKY_WIDTH / 2, top: 128 }}
            />
          </div>
        </div>

        <div className="tsuru-words">
          <m.p
            data-testid="ceremony-names"
            className="tsuru-names"
            initial={{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }}
            animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0)' }}
            transition={{
              opacity: { delay: TIMELINE.names, duration: 0.25 },
              clipPath: { delay: TIMELINE.names, duration: 0.8, ease: [0.45, 0, 0.25, 1] },
            }}
          >
            {tenantName}
          </m.p>
          <m.span
            className="tsuru-rule"
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{
              delay: TIMELINE.congrats - 0.1,
              duration: 0.6,
              ease: [0.22, 0.61, 0.36, 1],
            }}
          />
          <m.p
            className="tsuru-congrats"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: TIMELINE.congrats, duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
          >
            {ja.ceremony.couple.congrats}
          </m.p>
          <m.p
            className="tsuru-note"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: TIMELINE.note, duration: 0.5 }}
          >
            {ja.ceremony.couple.note}
          </m.p>
        </div>
      </div>
    </FullscreenStage>
  )
}

/** 鶴が通ったあとに残る細い軌跡。鶴と同じ時間・同じ緩急で線が伸びるので、鶴の後ろにぴたりと付く */
function Trail({ side }: { side: keyof typeof FLIGHTS }) {
  const start = TIMELINE[side]
  return (
    <m.path
      d={FLIGHTS[side]}
      stroke={`url(#tsuru-trail-${side})`}
      strokeWidth={1.5}
      strokeLinecap="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: [0, 1, 1, 0] }}
      transition={{
        pathLength: { delay: start, duration: TIMELINE.flight, ease: FLIGHT_EASE },
        opacity: {
          delay: start,
          duration: COUPLE_CELEBRATION_DURATION - start - 0.6,
          times: [0, 0.05, 0.62, 1],
        },
      }}
    />
  )
}

/**
 * 一羽の鶴。CSS の offset-path で軌跡の上を進み、進む向きに機首を傾ける。
 * 中では、羽で風をとらえるような小さな揺れと、着いたあとに相手へ寄り添う動きを重ねる
 */
function Crane({ side }: { side: keyof typeof FLIGHTS }) {
  const start = TIMELINE[side]
  // 寄り添う向き（金は右へ、紅は左へ）
  const toward = side === 'kin' ? 1 : -1
  return (
    <m.div
      className="tsuru-crane"
      data-side={side}
      style={{ offsetPath: `path("${FLIGHTS[side]}")` } as CSSProperties}
      initial={{ offsetDistance: '0%', opacity: 0 }}
      animate={{ offsetDistance: '100%', opacity: 1 }}
      transition={{
        offsetDistance: { delay: start, duration: TIMELINE.flight, ease: FLIGHT_EASE },
        opacity: { delay: start, duration: 0.2 },
      }}
    >
      <m.div
        className="tsuru-body"
        initial={{ x: 0, rotate: 0, rotateX: 0 }}
        animate={{
          rotateX: [0, 14, -8, 0],
          x: [0, 0, toward * 2.5],
          rotate: [0, 0, toward * 6, 0],
        }}
        transition={{
          rotateX: { delay: start, duration: TIMELINE.flight, ease: 'easeInOut' },
          x: {
            delay: start,
            duration: TIMELINE.nestle - start + 0.5,
            times: [0, (TIMELINE.nestle - start) / (TIMELINE.nestle - start + 0.5), 1],
            ease: ['linear', [0.3, 1.4, 0.5, 1]],
          },
          rotate: {
            delay: TIMELINE.nestle,
            duration: 0.7,
            times: [0, 0.01, 0.45, 1],
            ease: ['linear', 'easeOut', [0.4, 0, 0.3, 1]],
          },
        }}
      >
        <Orizuru tone={side} className="tsuru-figure" />
      </m.div>
    </m.div>
  )
}
