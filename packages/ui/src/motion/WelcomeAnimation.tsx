import { cubicBezier, m } from 'motion/react'
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { ja } from '../messages/ja'
import {
  MIZUHIKI_KNOT_PATH,
  MIZUHIKI_VIEWBOX,
  MIZUHIKI_WEAVE,
  MizuhikiDefs,
  mizuhikiLayers,
  useMizuhikiId,
} from '../ornaments/MizuhikiKnot'
import { WELCOME_DURATION } from './durations'
import { FullscreenStage } from './FullscreenStage'
import { KinpakuFlakes } from './particles'

export type WelcomeAnimationProps = {
  tenantName: string
  /** 式の日付（YYYY-MM-DD）。渡すと名前の下に金の数字で出す */
  eventDate?: string
  onComplete: () => void
  /** 飛ばすボタンのラベル */
  skipLabel: string
}

/**
 * 金屏風の時間割（秒）。合計は WELCOME_DURATION（3.6 秒）で、最後の 0.5 秒で舞台が溶ける。
 * 水引を結ぶ → 結び目が締まって光が一度走る（間）→ 屏風が左右に畳まれて開く → 名前と日付 → 金箔
 */
const TIMELINE = {
  tie: 0.1,
  tieFor: 1.0,
  glint: 0.95,
  glintFor: 0.6,
  open: 1.22,
  openFor: 1.12,
  rise: 1.3,
  riseFor: 0.95,
  greeting: 1.62,
  names: 1.78,
  date: 2.2,
  leaf: 1.32,
} as const

/** 屏風の一扇が開ききったときの折れ角（度）。扇ごとに向きが交互になり、ジグザグに畳まれる */
const FOLD = 84
/** 屏風を開く動き。ゆっくり動き出し、重さを残して止まる */
const OPEN_EASE = [0.6, 0.02, 0.22, 1] as const
/** 水引を結ぶ線の進み方 */
const TIE_EASE = [0.45, 0.05, 0.3, 1] as const
const tieCurve = cubicBezier(...TIE_EASE)

/** 線の進み具合 progress（0〜1）に達する時刻の割合（TIE_EASE の逆関数を二分法で求める） */
function tieTimeAt(progress: number): number {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (tieCurve(mid) < progress) lo = mid
    else hi = mid
  }
  return hi
}

/** 「A & B」を二人の名前に分ける（区切りも残して、つなげると元の文字に戻る） */
function splitNames(name: string): { first: string; separator: string; second: string } | null {
  const match = /^(.+?)(\s*[&＆]\s*)(.+)$/.exec(name)
  if (!match) return null
  const [, first = '', separator = '', second = ''] = match
  return { first, separator, second }
}

/** 英数字の語が入る名前は、縦書きにすると横倒しになるので横書きにする */
const canWriteVertically = (name: string) => !/[A-Za-z0-9]{2,}/.test(name)

/** 2026-10-31 → 2026.10.31 */
const formatDate = (date: string) => date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1.$2.$3')

export function WelcomeAnimation({
  tenantName,
  eventDate,
  onComplete,
  skipLabel,
}: WelcomeAnimationProps) {
  const knotRef = useRef<HTMLDivElement>(null)
  const crestRef = useRef<HTMLDivElement>(null)
  const [crest, setCrest] = useState({ x: 0, y: -160, scale: 0.45 })

  // 結び目が昇って収まる位置（名前の上の空き）を測る
  useLayoutEffect(() => {
    const knot = knotRef.current?.getBoundingClientRect()
    const slot = crestRef.current?.getBoundingClientRect()
    if (!knot || !slot || knot.width === 0) return
    setCrest({
      x: slot.left + slot.width / 2 - (knot.left + knot.width / 2),
      y: slot.top + slot.height / 2 - (knot.top + knot.height / 2),
      scale: slot.width / knot.width,
    })
  }, [])

  const names = splitNames(tenantName)
  const vertical = canWriteVertically(tenantName)
  const longest = names ? Math.max(names.first.length, names.second.length) : tenantName.length

  return (
    <FullscreenStage
      duration={WELCOME_DURATION}
      onComplete={onComplete}
      skipLabel={skipLabel}
      scene="byobu"
    >
      {/* 奥: 臙脂の青海波の面と、おふたりの名前 */}
      <m.div
        className="byobu-back wa-seigaiha"
        initial={{ scale: 1.08 }}
        animate={{ scale: [1.08, 1.08, 1, 1], y: [0, 0, 0, -10] }}
        transition={{
          duration: WELCOME_DURATION,
          times: [0, TIMELINE.open / WELCOME_DURATION, 0.78, 1],
          ease: ['linear', [0.3, 0.1, 0.2, 1], 'easeIn'],
        }}
      >
        <div className="byobu-lamp" />
        <div className="byobu-reveal">
          <div className="byobu-crest-slot" ref={crestRef} />
          <Rise at={TIMELINE.greeting}>
            <p className="byobu-greeting">{ja.ceremony.welcome.greeting}</p>
          </Rise>
          <m.p
            data-testid="ceremony-names"
            className="byobu-names"
            data-vertical={vertical ? '' : undefined}
            style={{ '--chars': longest } as CSSProperties}
            initial={{ opacity: 0, clipPath: vertical ? 'inset(0 0 100% 0)' : 'inset(0 100% 0 0)' }}
            animate={{ opacity: 1, clipPath: 'inset(0 0 0% 0)' }}
            transition={{
              delay: TIMELINE.names,
              opacity: { delay: TIMELINE.names, duration: 0.3 },
              clipPath: { delay: TIMELINE.names, duration: 0.85, ease: [0.4, 0, 0.2, 1] },
            }}
          >
            {names ? (
              <>
                <span className="byobu-name">{names.first}</span>
                <span className="byobu-amp">{names.separator}</span>
                <span className="byobu-name">{names.second}</span>
              </>
            ) : (
              tenantName
            )}
          </m.p>
          {eventDate ? (
            <Rise at={TIMELINE.date}>
              <p className="byobu-date">{formatDate(eventDate)}</p>
            </Rise>
          ) : null}
        </div>
      </m.div>

      {/* 手前: 6 曲の金屏風。左右 3 扇ずつが蝶番でつながり、ジグザグに畳まれながら開く */}
      <div className="byobu">
        <Wing side="left" />
        <Wing side="right" />
        <m.div
          className="byobu-glint"
          initial={{ x: '-70%', opacity: 0 }}
          animate={{ x: '70%', opacity: [0, 1, 1, 0] }}
          transition={{
            delay: TIMELINE.glint,
            duration: TIMELINE.glintFor,
            ease: [0.4, 0, 0.6, 1],
            opacity: {
              delay: TIMELINE.glint,
              duration: TIMELINE.glintFor,
              times: [0, 0.2, 0.7, 1],
            },
          }}
        />
      </div>

      {/* 屏風の中央で結ばれ、開くと名前の上へ昇る水引 */}
      <m.div
        ref={knotRef}
        className="byobu-knot"
        initial={{ x: 0, y: 0, scale: 1 }}
        animate={{ x: crest.x, y: crest.y, scale: [1, 1.04, 1, crest.scale] }}
        transition={{
          x: { delay: TIMELINE.rise, duration: TIMELINE.riseFor, ease: [0.3, 0, 0.15, 1] },
          y: { delay: TIMELINE.rise, duration: TIMELINE.riseFor, ease: [0.3, 0, 0.15, 1] },
          scale: {
            delay: TIMELINE.tie + TIMELINE.tieFor - 0.08,
            duration: TIMELINE.rise + TIMELINE.riseFor - (TIMELINE.tie + TIMELINE.tieFor - 0.08),
            times: [0, 0.12, 0.3, 1],
            ease: ['easeOut', 'easeInOut', [0.3, 0, 0.15, 1]],
          },
        }}
      >
        <MizuhikiTie delay={TIMELINE.tie} duration={TIMELINE.tieFor} />
      </m.div>

      <KinpakuFlakes count={18} delay={TIMELINE.leaf} duration={2.1} />
    </FullscreenStage>
  )
}

/** 少し下から立ち上がって現れる */
function Rise({ at, children }: { at: number; children: ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: at, duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </m.div>
  )
}

/** 屏風の片側（3 扇）。外側の扇が端の蝶番で、内側の扇が順に入れ子でつながる */
function Wing({ side }: { side: 'left' | 'right' }) {
  const sign = side === 'left' ? 1 : -1
  // 屏風全体の左から数えた扇の番号（金箔の面を 6 扇で続けて見せる）
  const column = (i: number) => (side === 'left' ? i : 5 - i)
  return (
    <div className="byobu-wing" data-side={side}>
      <Panel column={column(0)} turn={sign * FOLD} lit>
        <Panel column={column(1)} turn={-sign * 2 * FOLD} lit={false}>
          <Panel column={column(2)} turn={sign * 2 * FOLD} lit />
        </Panel>
      </Panel>
    </div>
  )
}

/**
 * 一扇。親の扇に対して turn 度だけ折れる。全扇が同じ時間・同じ緩急で動くので、蝶番が離れない。
 * 屏風の中央を向く扇（lit）は光を受け、外を向く扇は影になる
 */
function Panel({
  column,
  turn,
  lit,
  children,
}: {
  column: number
  turn: number
  lit: boolean
  children?: ReactNode
}) {
  const fold = { delay: TIMELINE.open, duration: TIMELINE.openFor, ease: OPEN_EASE }
  return (
    <m.div
      className="byobu-panel"
      initial={{ rotateY: 0 }}
      animate={{ rotateY: turn }}
      transition={fold}
    >
      <div className="byobu-face" style={{ '--col': column } as CSSProperties} />
      <m.div
        className="byobu-shade"
        data-lit={lit ? '' : undefined}
        initial={{ opacity: lit ? 0.14 : 0.26 }}
        animate={{ opacity: lit ? [0.14, 0.7, 0.35] : [0.26, 0.95] }}
        transition={{ ...fold, times: lit ? [0, 0.55, 1] : [0, 1] }}
      />
      {children}
    </m.div>
  )
}

/** 水引を結ぶ。5 本どりの紐を重ねたまま線で描き、紐が交差を通り過ぎた時点でその交差を編み上げる */
function MizuhikiTie({ delay, duration }: { delay: number; duration: number }) {
  const id = useMizuhikiId()
  const layers = mizuhikiLayers(id, 'five', 'kinbeni')
  const stack = (d: string) =>
    layers.map((layer) => (
      <path key={layer.width} d={d} stroke={layer.color} strokeWidth={layer.width} />
    ))
  return (
    <svg
      viewBox={MIZUHIKI_VIEWBOX}
      className="byobu-knot-svg"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <MizuhikiDefs id={id} />
      {layers.map((layer) => (
        <m.path
          key={layer.width}
          d={MIZUHIKI_KNOT_PATH}
          stroke={layer.color}
          strokeWidth={layer.width}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            pathLength: { delay, duration, ease: TIE_EASE },
            opacity: { delay, duration: 0.01 },
          }}
        />
      ))}
      {MIZUHIKI_WEAVE.map((weave, i) => (
        <m.g
          key={weave.patch}
          mask={`url(#${id}-weave-${i})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + duration * tieTimeAt(weave.at), duration: 0.01 }}
        >
          {stack(weave.piece)}
        </m.g>
      ))}
    </svg>
  )
}
