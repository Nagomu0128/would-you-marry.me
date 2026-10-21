import { type SVGProps, useId } from 'react'

/** あわじ結びの 1 本の紐（3 つの輪と、交差して下に伸びる 2 本の端）。演出で線を描くときもこの形を使う */
export const MIZUHIKI_KNOT_PATH =
  'M34 172C42.3 165.3 69 144 84 132C99 120 113 110 124 100C135 90 147 82.3 150 72C153 61.7 148.3 45 142 38C135.7 31 121 27.7 112 30C103 32.3 91.3 43 88 52C84.7 61 86 74.7 92 84C98 93.3 111.7 102 124 108C136.3 114 152.7 121.3 166 120C179.3 118.7 197.7 109.7 204 100C210.3 90.3 209.3 70.7 204 62C198.7 53.3 183.3 47.7 172 48C160.7 48.3 147.3 61 136 64C124.7 67 115 68.7 104 66C93 63.3 81 48.7 70 48C59 47.3 43.7 53.3 38 62C32.3 70.7 30 90.3 36 100C42 109.7 60.7 118.7 74 120C87.3 121.3 103.3 105.7 116 108C128.7 110.3 135 123.3 150 134C165 144.7 196.7 165.7 206 172'

/** 右上の交差だけ上下を入れ替えて、編み目に見せる短い区間（端は butt） */
export const MIZUHIKI_WEAVE_PATCH = 'M150 72C153 61.7 148.3 45 142 38'

export const MIZUHIKI_VIEWBOX = '20 18 200 166'

/**
 * 1 本の紐を何本の水引に見せるか。外側から [幅, 色] の順に重ねる。
 * 'gap' は背景色（--knot-gap）で、線の間のすき間と、交差の切れ目になる。
 */
const STRAND_LAYERS = {
  five: [
    [13, 'gap'],
    [10.4, 'kin'],
    [8.4, 'gap'],
    [6.4, 'beni'],
    [4.4, 'gap'],
    [2.4, 'kin'],
  ],
  three: [
    [11, 'gap'],
    [8.6, 'kin'],
    [6, 'gap'],
    [3.4, 'beni'],
  ],
  one: [
    [11, 'gap'],
    [7, 'kin'],
  ],
} as const

export type MizuhikiStrands = keyof typeof STRAND_LAYERS

export type MizuhikiTone =
  /** 金と紅（祝儀袋の金赤）。既定 */
  | 'kinbeni'
  /** 金だけ */
  | 'kin'
  /** 濃い面（臙脂・漆）の上。紅の代わりに淡い金 */
  | 'on-dark'

export type MizuhikiKnotProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  /** 細い表示（48px 未満）は 'one'、中くらいは 'three'、大きな表示は 'five' */
  strands?: MizuhikiStrands
  tone?: MizuhikiTone
}

/**
 * 結婚式の水引「あわじ結び」（結び切り。一度きりのお祝いに使う結び方）。
 * 蝶結びは使わない。交差の切れ目は背景色で描くので、置く面の色を CSS の --knot-gap に渡す。
 */
export function MizuhikiKnot({
  strands = 'five',
  tone = 'kinbeni',
  className,
  ...props
}: MizuhikiKnotProps) {
  // useId の値には url(#…) で使えない文字が入るので取り除く
  const gradientId = `kin-${useId().replace(/[^\w-]/g, '')}`
  const color = (key: 'gap' | 'kin' | 'beni') => {
    if (key === 'gap') return 'var(--knot-gap, var(--color-surface))'
    if (key === 'kin' || tone === 'kin') return `url(#${gradientId})`
    return tone === 'on-dark' ? 'var(--color-gold-light)' : 'var(--color-accent)'
  }
  const stack = (d: string, cap: 'round' | 'butt') =>
    STRAND_LAYERS[strands].map(([width, key]) => (
      <path
        key={`${cap}-${width}`}
        d={d}
        stroke={color(key)}
        strokeWidth={width}
        strokeLinecap={cap}
      />
    ))

  return (
    <svg
      viewBox={MIZUHIKI_VIEWBOX}
      width={200}
      height={166}
      className={['wa-mizuhiki', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
      fill="none"
      {...props}
    >
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1="30"
          y1="20"
          x2="210"
          y2="175"
        >
          <stop offset="0" stopColor="#8a6420" />
          <stop offset="0.35" stopColor="#e6cd8c" />
          <stop offset="0.7" stopColor="#b08a3e" />
          <stop offset="1" stopColor="#7d5a1c" />
        </linearGradient>
      </defs>
      {stack(MIZUHIKI_KNOT_PATH, 'round')}
      {stack(MIZUHIKI_WEAVE_PATCH, 'butt')}
    </svg>
  )
}
