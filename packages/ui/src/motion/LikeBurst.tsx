import { m, useReducedMotion } from 'motion/react'
import { useEffect } from 'react'
import { LIKE_BURST_DURATION } from './durations'
import { useCompleteOnce } from './use-complete-once'

export type LikeBurstProps = {
  /** true になるたびに再生する（いいねしたとき）。取り消し（false）では何も出さない */
  active: boolean
  onComplete?: () => void
  /** 散る中心の位置の調整。既定は親の箱の中央（親に position: relative が要る） */
  className?: string
}

type PieceKind = 'blossom' | 'petal' | 'grain'
type Piece = {
  kind: PieceKind
  tone: 'beni' | 'kinari' | 'kin'
  /** 散る向き（ラジアン。0 が右、負が上） */
  angle: number
  /** 中心から散る距離（px） */
  reach: number
  /** 散ったあとに落ちる量（px） */
  fall: number
  /** 落ちながら横に流れる量（px） */
  drift: number
  /** 回転（度） */
  spin: number
  size: number
  delay: number
}

// 配置は固定（毎回同じ形に散る）。乱数の代わりに決まった値の列を使う
function seeded(i: number, salt: number): number {
  const x = Math.sin((i + 1) * 12.9898 * salt) * 43758.5453
  return x - Math.floor(x)
}

function makePieces(): Piece[] {
  const kinds: { kind: PieceKind; tone: Piece['tone'] }[] = [
    { kind: 'blossom', tone: 'beni' },
    { kind: 'grain', tone: 'kin' },
    { kind: 'petal', tone: 'kinari' },
    { kind: 'blossom', tone: 'kinari' },
    { kind: 'grain', tone: 'kin' },
    { kind: 'petal', tone: 'beni' },
    { kind: 'blossom', tone: 'beni' },
    { kind: 'grain', tone: 'kin' },
    { kind: 'petal', tone: 'kinari' },
    { kind: 'blossom', tone: 'kinari' },
    { kind: 'grain', tone: 'kin' },
    { kind: 'petal', tone: 'beni' },
    { kind: 'blossom', tone: 'beni' },
    { kind: 'grain', tone: 'kin' },
    { kind: 'grain', tone: 'kin' },
  ]
  const count = kinds.length
  return kinds.map(({ kind, tone }, i) => {
    // 上を中心に左右 140 度ほどへ噴き上げるように散らす（落ちてくる分、上に出たほうが長く見える）
    const base = -Math.PI / 2 + (i / (count - 1) - 0.5) * Math.PI * 1.55
    const angle = base + (seeded(i, 1) - 0.5) * 0.7
    const reach = kind === 'grain' ? 14 + seeded(i, 2) * 34 : 18 + seeded(i, 2) * 26
    return {
      kind,
      tone,
      angle,
      reach,
      fall: 18 + seeded(i, 3) * 20 + (kind === 'petal' ? 8 : 0),
      drift: (seeded(i, 4) - 0.5) * 18,
      spin: (seeded(i, 5) > 0.5 ? 1 : -1) * (kind === 'grain' ? 120 : 140 + seeded(i, 6) * 160),
      size:
        kind === 'blossom' ? 9 + seeded(i, 7) * 4 : kind === 'petal' ? 7 : 2.5 + seeded(i, 8) * 2,
      delay: 0.09 + seeded(i, 9) * 0.07,
    }
  })
}

const PIECES = makePieces()

// 梅の花（5 弁）。中心に金の蕊
function Blossom({ tone }: { tone: Piece['tone'] }) {
  return (
    <svg
      viewBox="-10 -10 20 20"
      className="wa-like-shape"
      data-tone={tone}
      aria-hidden="true"
      focusable="false"
    >
      {[0, 1, 2, 3, 4].map((k) => {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2
        return <circle key={k} cx={Math.cos(a) * 4.6} cy={Math.sin(a) * 4.6} r={4.3} />
      })}
      <circle className="wa-like-stamen" r={1.9} />
    </svg>
  )
}

// 一枚の花びら（梅は丸い）
function Petal({ tone }: { tone: Piece['tone'] }) {
  return (
    <svg
      viewBox="-6 -6 12 12"
      className="wa-like-shape"
      data-tone={tone}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 -5.2C3.6 -5.2 5.2 -2.2 4.6 1C4 3.8 1.8 5.2 0 4.4C-1.8 5.2 -4 3.8 -4.6 1C-5.2 -2.2 -3.6 -5.2 0 -5.2Z" />
    </svg>
  )
}

/**
 * いいねの瞬間の演出（0.9 秒）。ハートのアイコンと同じ親（position: relative）の中に置く。
 * - 親の直下にある svg（ハートのアイコン）が、小さく沈んでから弾む（micro.css の :has で動かす）
 * - 金の光の輪が一度ひらき、梅の花・花びら（紅と生成り）と金の粒が放射状に散って、回転しながら落ちて消える
 * 取り消しでは何も出さない。動きを減らす設定では何も出さずに、すぐ onComplete を呼ぶ。
 */
export function LikeBurst({ active, onComplete, className }: LikeBurstProps) {
  const reduced = useReducedMotion()
  const { complete, reset } = useCompleteOnce(onComplete)

  useEffect(() => {
    if (!active) {
      reset()
      return
    }
    if (reduced) {
      complete()
      return
    }
    const timer = setTimeout(complete, LIKE_BURST_DURATION * 1000)
    return () => clearTimeout(timer)
  }, [active, reduced, complete, reset])

  if (!active || reduced) return null

  return (
    <div
      data-testid="like-burst"
      aria-hidden="true"
      className={['wa-like', className].filter(Boolean).join(' ')}
    >
      {/* 弾んだ瞬間の光。ぼかしではなく放射状のグラデーションを拡大・消去する */}
      <m.span
        className="wa-like-glow"
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 1.1, 1.3], opacity: [0, 0.75, 0] }}
        transition={{ delay: 0.1, duration: 0.34, times: [0, 0.3, 1], ease: 'easeOut' }}
      />
      <m.span
        className="wa-like-ring"
        initial={{ scale: 0.45, opacity: 0 }}
        animate={{ scale: [0.5, 1.45, 1.8], opacity: [0, 0.7, 0] }}
        transition={{
          delay: 0.11,
          duration: 0.5,
          times: [0, 0.4, 1],
          ease: [0.22, 0.61, 0.36, 1],
        }}
      />
      {PIECES.map((piece, i) => {
        const dx = Math.cos(piece.angle) * piece.reach
        const dy = Math.sin(piece.angle) * piece.reach
        const duration = LIKE_BURST_DURATION - piece.delay - 0.02
        return (
          <m.span
            // biome-ignore lint/suspicious/noArrayIndexKey: 固定の装飾
            key={i}
            data-testid="like-grain"
            data-kind={piece.kind}
            className="wa-like-piece"
            style={{ width: piece.size, height: piece.size }}
            initial={{ x: 0, y: 0, scaleX: 0.2, scaleY: 0.2, rotate: 0, opacity: 0 }}
            animate={{
              x: [0, dx, dx + piece.drift],
              y: [0, dy, dy + piece.fall],
              rotate: [0, piece.spin * 0.35, piece.spin],
              // 花びらは落ちながら裏返る（横につぶれて戻る）
              scaleX: piece.kind === 'petal' ? [0.2, 1, 0.35] : [0.2, 1, 0.9],
              scaleY: [0.2, 1, 0.9],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              delay: piece.delay,
              duration,
              times: [0, 0.38, 1],
              ease: [
                [0.16, 0.84, 0.3, 1],
                [0.5, 0, 0.75, 0.6],
              ],
              opacity: {
                delay: piece.delay,
                duration,
                times: [0, 0.12, 0.62, 1],
                ease: 'linear',
              },
            }}
          >
            {piece.kind === 'blossom' ? (
              <Blossom tone={piece.tone} />
            ) : piece.kind === 'petal' ? (
              <Petal tone={piece.tone} />
            ) : null}
          </m.span>
        )
      })}
    </div>
  )
}
