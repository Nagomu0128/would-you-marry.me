import { useId } from 'react'
import {
  MIZUHIKI_KNOT_PATH,
  MIZUHIKI_VIEWBOX,
  MIZUHIKI_WEAVE_PATCH,
} from '../ornaments/MizuhikiKnot'

/**
 * 線で描いていくための水引（あわじ結び）。形は MizuhikiKnot と同じで、紐の重ねも同じ。
 * 各線は pathLength=1 で、micro.css の stroke-dashoffset（--wa-knot-draw）で描いた量を決める。
 * 1 で何も描かれず、0 で結び終わり、-1 に向かうと結び目の手前からほどける。
 * 交差の上下を入れ替える短い区間（.wa-knot-weave）は、結び終わってから出す。
 */
const LAYERS = {
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
  /** 小さく出すとき（40px 前後）。1 本を太めにして、細くなりすぎないようにする */
  bold: [
    [16, 'gap'],
    [10.5, 'kin'],
  ],
} as const

export type DrawnKnotStrands = keyof typeof LAYERS

export type DrawnKnotProps = {
  strands?: DrawnKnotStrands
  /** 濃い面の上では紅の代わりに淡い金にする */
  tone?: 'kinbeni' | 'on-dark'
  className?: string
}

export function DrawnKnot({ strands = 'three', tone = 'kinbeni', className }: DrawnKnotProps) {
  const gradientId = `wa-knot-${useId().replace(/[^\w-]/g, '')}`
  const color = (key: 'gap' | 'kin' | 'beni') => {
    if (key === 'gap') return 'var(--knot-gap, var(--color-surface))'
    if (key === 'kin') return `url(#${gradientId})`
    return tone === 'on-dark' ? 'var(--color-gold-light)' : 'var(--color-accent)'
  }
  const stack = (d: string, cap: 'round' | 'butt') =>
    LAYERS[strands].map(([width, key]) => (
      <path
        key={`${key}-${width}`}
        d={d}
        pathLength={1}
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
      className={['wa-knot', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
      fill="none"
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
          <stop offset="0" style={{ stopColor: 'var(--color-gold-deep)' }} />
          <stop offset="0.35" style={{ stopColor: 'var(--color-gold-light)' }} />
          <stop offset="0.7" style={{ stopColor: 'var(--color-gold)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-gold-deep)' }} />
        </linearGradient>
      </defs>
      <g className="wa-knot-cord">{stack(MIZUHIKI_KNOT_PATH, 'round')}</g>
      <g className="wa-knot-weave">{stack(MIZUHIKI_WEAVE_PATCH, 'butt')}</g>
    </svg>
  )
}
