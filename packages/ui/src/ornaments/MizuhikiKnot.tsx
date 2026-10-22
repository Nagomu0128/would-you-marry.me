import { type SVGProps, useId } from 'react'

/**
 * あわじ結びの 1 本の紐。左下の端から右の耳 → 上の輪 → 左の耳 → 右下の端へ、左右対称に通る。
 * 交差は 8 か所で、紐に沿って上・下が交互になる（MIZUHIKI_WEAVE）。演出で線を描くときもこの形を使う
 */
export const MIZUHIKI_KNOT_PATH =
  'M34 174C43.3 164.7 52.8 156.3 62 146C72.2 134.6 81.9 121 92 108C102.6 94.4 111.3 76.3 124 66C135.6 56.6 150.8 48.3 164 47C176.1 45.8 192 49.2 200 56C207.3 62.2 212.8 74.9 212 84C211.2 93.5 202.9 106 194 112C184.2 118.7 167.3 120.6 154 120C140.6 119.4 124.4 115.2 114 108C104.5 101.4 96.3 89.9 93 80C90 71.1 91.1 60.1 93 52C94.6 45.1 97.4 38.2 102 34C106.5 29.9 114 27 120 27C126 27 133.5 29.9 138 34C142.6 38.2 145.4 45.1 147 52C148.9 60.1 150 71.1 147 80C143.7 89.9 135.5 101.4 126 108C115.6 115.2 99.4 119.4 86 120C72.7 120.6 55.8 118.7 46 112C37.1 106 28.8 93.5 28 84C27.2 74.9 32.7 62.2 40 56C48 49.2 63.9 45.8 76 47C89.2 48.3 104.4 56.6 116 66C128.7 76.3 137.4 94.4 148 108C158.1 121 167.8 134.6 178 146C187.2 156.3 196.7 164.7 206 174'

/**
 * 交差ごとの、上になる紐の区間。
 * patch は見せる範囲（マスク）、piece はそれより少し長い中身（端のにじみをマスクの外に逃がす）、
 * at は MIZUHIKI_KNOT_PATH を描く演出でこの交差を編み上げる位置（道のりの割合）
 */
export const MIZUHIKI_WEAVE: readonly { patch: string; piece: string; at: number }[] = [
  {
    patch: 'M72.2 133.8C78.8 125.5 85.3 116.6 92 108C92.4 107.5 92.8 106.9 93.2 106.4',
    piece: 'M68.5 138.4C76.4 128.8 84.1 118.2 92 108C93.6 105.9 95.2 103.8 96.7 101.5',
    at: 0.641,
  },
  {
    patch: 'M108.3 103.4C102.5 97.8 97.6 90.8 94.6 84',
    piece: 'M112.9 107.2C103.9 100.5 96.2 89.5 93 80C92.8 79.5 92.7 78.9 92.5 78.4',
    at: 0.424,
  },
  {
    patch: 'M113.6 76.9C116.8 72.8 120.2 69.1 124 66C125.1 65.1 126.3 64.2 127.4 63.3',
    piece: 'M110 81.7C114.3 75.7 118.8 70.2 124 66C126.6 63.9 129.4 61.8 132.3 59.9',
    at: 0.85,
  },
  {
    patch: 'M143.3 41.3C144.9 44.6 146.1 48.3 147 52C147.8 55.2 148.4 59 148.7 62.8',
    piece: 'M140.1 36.2C143.5 40.4 145.7 46.2 147 52C148.2 56.9 149 62.9 148.8 68.8',
    at: 0.554,
  },
  {
    patch: 'M174.4 118.9C167.6 120 160.4 120.3 154 120C149.6 119.8 144.8 119.2 140.1 118.2',
    piece: 'M180.3 117.7C171.9 119.8 162.2 120.4 154 120C147.7 119.7 140.9 118.7 134.3 116.9',
    at: 0.908,
  },
  {
    patch: 'M132.2 102.9C130.2 104.8 128.1 106.5 126 108C120.1 112.1 112.3 115.2 104.2 117.3',
    piece: 'M136.3 98.5C133.2 102.1 129.7 105.4 126 108C118.7 113.1 108.5 116.7 98.4 118.5',
    at: 0.634,
  },
  {
    patch: 'M82.5 48.2C89.3 49.8 96.3 53 102.9 56.9',
    piece: 'M76.6 47.1C86.8 48.2 98.1 53.5 108 60.1',
    at: 0.836,
  },
  {
    patch: 'M131.8 84.4C136.7 91.4 141.3 99 146.2 105.7',
    piece: 'M128.4 79.5C135.2 88.7 141.2 99.3 148 108C148.6 108.8 149.3 109.6 149.9 110.4',
    at: 0.905,
  },
]

/** 交差で上になる区間をつないだもの（端は butt）。紐の上に重ねて描くと編み目になる */
export const MIZUHIKI_WEAVE_PATCH = MIZUHIKI_WEAVE.map((weave) => weave.patch).join('')

export const MIZUHIKI_VIEWBOX = '20 18 200 166'

/**
 * 1 本の紐を何本の水引に見せるか。外側から [幅, 色] の順に重ねる。
 * 'gap' は背景色（--knot-gap）で、交差の切れ目になる。'seam' は束ねた紐と紐の間の細い影
 */
const STRAND_LAYERS = {
  five: [
    [14.4, 'gap'],
    [12, 'kin'],
    [8, 'seam'],
    [7.2, 'beni'],
    [3.2, 'seam'],
    [2.4, 'kin'],
  ],
  three: [
    [14, 'gap'],
    [11.6, 'kin'],
    [5.2, 'seam'],
    [4.4, 'beni'],
  ],
  one: [
    [13, 'gap'],
    [9, 'kin'],
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

/** 紐の 1 層。描く演出でも同じ層を重ねる */
export type MizuhikiLayer = { width: number; color: string }

/** useId の値には url(#…) で使えない文字が入るので取り除く */
export function useMizuhikiId(): string {
  return `mizuhiki-${useId().replace(/[^\w-]/g, '')}`
}

/** 紐を重ねる層（外側から）。色は MizuhikiDefs の id を参照する */
export function mizuhikiLayers(
  id: string,
  strands: MizuhikiStrands,
  tone: MizuhikiTone,
): MizuhikiLayer[] {
  const dark = tone === 'on-dark'
  // 細い 1 本どりは和紙の上で沈まないよう、濃い金で描く
  const kin = strands === 'one' && !dark ? `url(#${id}-kin-deep)` : `url(#${id}-kin)`
  const colors = {
    gap: 'var(--knot-gap, var(--color-surface))',
    kin,
    beni: tone === 'kin' ? kin : dark ? 'var(--color-gold-light)' : 'var(--color-accent)',
    seam: dark ? 'rgb(27 19 20 / 0.55)' : 'rgb(42 32 28 / 0.4)',
  }
  return STRAND_LAYERS[strands].map(([width, key]) => ({ width, color: colors[key] }))
}

/** 金のグラデーションと、交差の編み目のマスク */
export function MizuhikiDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient
        id={`${id}-kin`}
        gradientUnits="userSpaceOnUse"
        x1="20"
        y1="30"
        x2="220"
        y2="170"
      >
        <stop offset="0" stopColor="#8a6420" />
        <stop offset="0.22" stopColor="#c9a55a" />
        <stop offset="0.38" stopColor="#f0dca6" />
        <stop offset="0.55" stopColor="#b8923f" />
        <stop offset="0.72" stopColor="#e2c98f" />
        <stop offset="1" stopColor="#8a6420" />
      </linearGradient>
      <linearGradient
        id={`${id}-kin-deep`}
        gradientUnits="userSpaceOnUse"
        x1="20"
        y1="30"
        x2="220"
        y2="170"
      >
        <stop offset="0" stopColor="#8a6420" />
        <stop offset="0.45" stopColor="#a07a32" />
        <stop offset="1" stopColor="#8a6420" />
      </linearGradient>
      {MIZUHIKI_WEAVE.map((weave, i) => (
        <mask
          key={weave.patch}
          id={`${id}-weave-${i}`}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="240"
          height="200"
        >
          <path d={weave.patch} stroke="#fff" strokeWidth={17} fill="none" />
        </mask>
      ))}
    </defs>
  )
}

export type MizuhikiKnotProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  /** 細い表示（48px 未満）は 'one'、中くらいは 'three'、大きな表示は 'five' */
  strands?: MizuhikiStrands
  tone?: MizuhikiTone
}

/**
 * 結婚式の水引「あわじ結び」（結び切り。一度きりのお祝いに使う結び方）。
 * 蝶結びは使わない。交差の切れ目は背景色で描くので、置く面の色を CSS の --knot-gap に渡す。
 * 交差では、上になる紐の区間をマスクで切り抜いて重ね直し、上・下を交互に見せる
 */
export function MizuhikiKnot({
  strands = 'five',
  tone = 'kinbeni',
  className,
  ...props
}: MizuhikiKnotProps) {
  const id = useMizuhikiId()
  const layers = mizuhikiLayers(id, strands, tone)
  const stack = (d: string) =>
    layers.map((layer) => (
      <path key={layer.width} d={d} stroke={layer.color} strokeWidth={layer.width} />
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
      <MizuhikiDefs id={id} />
      {stack(MIZUHIKI_KNOT_PATH)}
      {MIZUHIKI_WEAVE.map((weave, i) => (
        <g key={weave.patch} mask={`url(#${id}-weave-${i})`}>
          {stack(weave.piece)}
        </g>
      ))}
    </svg>
  )
}
