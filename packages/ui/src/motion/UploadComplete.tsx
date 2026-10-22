import { m } from 'motion/react'
import { useId } from 'react'
import { ja } from '../messages/ja'
import { UPLOAD_COMPLETE_DURATION } from './durations'
import { FullscreenStage } from './FullscreenStage'
import { PaperConfetti } from './particles'

export type UploadCompleteProps = {
  onComplete: () => void
  /** 飛ばすボタンのラベル */
  skipLabel: string
  /** 投稿した写真のプレビュー URL。なければ色紙を置く */
  photoSrc?: string
}

/**
 * 時間割（秒）。合計は UPLOAD_COMPLETE_DURATION（2.4 秒）で、最後の 0.5 秒で舞台が溶ける。
 * 台紙が現れる → 写真が置かれる → 印が降りてきて押される（紙が沈み、朱がにじむ）→ 紙吹雪 → 御礼
 */
const TIMELINE = {
  sheet: 0.06,
  photo: 0.26,
  approach: 0.72,
  press: 1.02,
  thanks: 1.22,
} as const

/** 押す瞬間までの降り方。重さで加速して紙に当たる */
const PRESS_EASE = [0.55, 0, 0.85, 0.45] as const

export function UploadComplete({ onComplete, skipLabel, photoSrc }: UploadCompleteProps) {
  const pressFor = TIMELINE.press - TIMELINE.approach
  return (
    <FullscreenStage
      duration={UPLOAD_COMPLETE_DURATION}
      onComplete={onComplete}
      skipLabel={skipLabel}
      scene="shuin"
      fadeIn={0.18}
    >
      <div className="shuin-layout">
        <m.div
          className="shuin-sheet"
          initial={{ opacity: 0, y: 26, rotate: -1.5, scale: 1 }}
          animate={{ opacity: 1, y: [26, 0, 0, 3, 0], rotate: 0, scale: [1, 1, 1, 0.982, 1] }}
          transition={{
            opacity: { delay: TIMELINE.sheet, duration: 0.3 },
            rotate: { delay: TIMELINE.sheet, duration: 0.5, ease: [0.22, 0.61, 0.36, 1] },
            // 押した瞬間に紙がわずかに沈み、張りで戻る
            y: {
              delay: TIMELINE.sheet,
              duration: TIMELINE.press - TIMELINE.sheet + 0.32,
              times: pressTimes(TIMELINE.sheet),
              ease: [[0.22, 0.61, 0.36, 1], 'linear', [0.2, 0.9, 0.4, 1], [0.4, 0, 0.3, 1]],
            },
            scale: {
              delay: TIMELINE.sheet,
              duration: TIMELINE.press - TIMELINE.sheet + 0.32,
              times: pressTimes(TIMELINE.sheet),
              ease: ['linear', 'linear', [0.2, 0.9, 0.4, 1], [0.4, 0, 0.3, 1]],
            },
          }}
        >
          <m.div
            className="shuin-photo"
            initial={{ opacity: 0, y: -34, rotate: 4, scale: 1.06 }}
            animate={{ opacity: 1, y: 0, rotate: -1.2, scale: 1 }}
            transition={{
              delay: TIMELINE.photo,
              opacity: { delay: TIMELINE.photo, duration: 0.18 },
              default: { type: 'spring', bounce: 0.18, duration: 0.55, delay: TIMELINE.photo },
            }}
          >
            {photoSrc ? (
              <img src={photoSrc} alt="" className="shuin-photo-image" />
            ) : (
              <div className="shuin-shikishi" />
            )}
          </m.div>

          <div className="shuin-seal-spot">
            {/* 降りてくる印の影。近づくほど濃く、小さく締まる */}
            <m.div
              className="shuin-shadow"
              initial={{ opacity: 0, scale: 1.7 }}
              animate={{ opacity: [0, 0.55, 0], scale: [1.7, 1, 1] }}
              transition={{
                delay: TIMELINE.approach,
                duration: pressFor + 0.08,
                times: [0, pressFor / (pressFor + 0.08), 1],
                ease: [PRESS_EASE, 'linear'],
              }}
            />
            {/* 印面: 上から降りてきて、当たった瞬間に消える（押した印影に入れ替わる） */}
            <m.div
              className="shuin-stamp"
              initial={{ opacity: 0, scale: 1.9, rotate: -14 }}
              animate={{ opacity: [0, 0.5, 0], scale: [1.9, 1.02, 1], rotate: [-14, -5, -5] }}
              transition={{
                delay: TIMELINE.approach,
                duration: pressFor + 0.05,
                times: [0, pressFor / (pressFor + 0.05), 1],
                ease: [PRESS_EASE, 'linear'],
              }}
            >
              <KotobukiSeal />
            </m.div>
            {/* にじみ: 押した瞬間から朱が紙の繊維に沿って少し広がる */}
            <m.div
              className="shuin-bleed"
              initial={{ opacity: 0, scale: 0.97, rotate: -5 }}
              animate={{ opacity: [0, 0.55, 0.4], scale: [0.97, 1.02, 1.045] }}
              transition={{ delay: TIMELINE.press, duration: 0.6, ease: [0.2, 0.7, 0.3, 1] }}
            >
              <KotobukiSeal blur />
            </m.div>
            {/* 印影 */}
            <m.div
              className="shuin-print"
              initial={{ opacity: 0, scale: 1.04, rotate: -5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: TIMELINE.press,
                opacity: { delay: TIMELINE.press, duration: 0.05 },
                scale: { delay: TIMELINE.press, type: 'spring', bounce: 0.2, duration: 0.35 },
              }}
            >
              <KotobukiSeal />
            </m.div>
            {/* 印を持ち上げる名残 */}
            <m.div
              className="shuin-stamp"
              initial={{ opacity: 0, scale: 1, rotate: -5 }}
              animate={{ opacity: [0, 0.32, 0], scale: [1, 1.04, 1.18] }}
              transition={{ delay: TIMELINE.press + 0.06, duration: 0.36, ease: 'easeOut' }}
            >
              <KotobukiSeal />
            </m.div>
            <PaperConfetti
              count={28}
              delay={TIMELINE.press}
              seed={5}
              power={0.85}
              style={{ left: '50%', top: '40%' }}
            />
          </div>
        </m.div>

        <m.p
          className="shuin-thanks"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: TIMELINE.thanks, duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
        >
          {ja.ceremony.upload.thanks}
        </m.p>
      </div>
    </FullscreenStage>
  )
}

/** 台紙の y・scale の節目: 現れて止まる → 押すまで待つ → 沈む → 戻る */
function pressTimes(start: number): number[] {
  const total = TIMELINE.press - start + 0.32
  return [
    0,
    0.45 / total,
    (TIMELINE.press - start) / total,
    (TIMELINE.press - start + 0.08) / total,
    1,
  ]
}

/**
 * 「寿」の角印（朱文）。篆刻のように太さのそろった線で字を組み、枠は手彫りのようにわずかに歪ませる。
 * かすれは紙の目のノイズでマスクして抜く。blur はにじみ用のぼかした写し
 */
function KotobukiSeal({ blur = false }: { blur?: boolean }) {
  const id = `seal-${useId().replace(/[^\w-]/g, '')}`
  return (
    <svg viewBox="0 0 100 100" className="shuin-seal" aria-hidden="true" focusable="false">
      <defs>
        <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05 0.42"
            numOctaves={2}
            seed={7}
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -7.5 0 0 0 4.9"
          />
        </filter>
        <mask id={`${id}-kasure`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="#fff" filter={`url(#${id}-grain)`} />
        </mask>
        {blur ? (
          <filter id={`${id}-bleed`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        ) : null}
      </defs>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="round"
        mask={blur ? undefined : `url(#${id}-kasure)`}
        filter={blur ? `url(#${id}-bleed)` : undefined}
      >
        {/* 枠: 角の丸い四角を、辺ごとにわずかにふくらませる */}
        <path
          d="M14 9.5C30 8.4 70 8.9 86.5 9.8C90.4 10 90.6 12.6 90.6 15C91.2 33 91 68 90.2 85.4C90 89.6 87.8 90.6 84.5 90.6C67 91.3 32 91 15.2 90.2C11 90 9.6 88 9.4 84.6C8.8 67 9 32 9.6 15.2C9.8 11.2 11.2 9.7 14 9.5Z"
          strokeWidth={6.2}
        />
        {/* 寿: 三の横画と、それを貫いて左へ払う縦画、右下に寸 */}
        <path d="M33 23.5H67M26.5 34H73.5M19 45H81" strokeWidth={6.4} />
        <path d="M50 16V45C50 61 42 74 23 84" strokeWidth={6.4} />
        <path
          d="M37 60H83M67.5 51V82.5C67.5 85 66.2 86 63.5 85.6L58.5 84.6M45.5 67.5L51 75"
          strokeWidth={6.4}
        />
      </g>
    </svg>
  )
}
