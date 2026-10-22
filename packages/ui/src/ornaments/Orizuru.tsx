import type { SVGProps } from 'react'

export type OrizuruFacetShade = 'light' | 'mid' | 'shade' | 'deep'

/** 折り鶴（横から見た形）の面。後ろの面から順に並ぶ。演出で折り上がりの形として使う */
export const ORIZURU_FACETS: readonly { name: string; points: string; shade: OrizuruFacetShade }[] =
  [
    { name: 'wing-back', points: '98,84 64,10 112,78', shade: 'mid' },
    { name: 'tail-front', points: '112,92 128,96 182,30', shade: 'light' },
    { name: 'tail-back', points: '112,92 182,30 122,86', shade: 'shade' },
    { name: 'neck-front', points: '88,94 72,96 22,40', shade: 'light' },
    { name: 'neck-back', points: '88,94 22,40 80,86', shade: 'shade' },
    { name: 'head', points: '22,40 30,40 12,58', shade: 'deep' },
    { name: 'body-top', points: '70,96 100,80 130,96', shade: 'light' },
    { name: 'body-bottom', points: '70,96 130,96 100,118', shade: 'shade' },
    { name: 'wing-front', points: '100,82 150,8 126,86', shade: 'light' },
    { name: 'wing-front-fold', points: '100,82 126,86 112,96', shade: 'deep' },
  ]

export const ORIZURU_VIEWBOX = '0 0 200 130'

export type OrizuruTone =
  /** 生成りの和紙。既定 */
  | 'kinu'
  /** 紅の千代紙 */
  | 'beni'
  /** 金の紙 */
  | 'kin'
  /** 線だけ（濃い面の上の装飾） */
  | 'line'

export type OrizuruProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  tone?: OrizuruTone
}

/**
 * 折り鶴。面の色は CSS 変数（--zuru-light / --zuru-mid / --zuru-shade / --zuru-deep / --zuru-line）で
 * 変えられる。tone はその初期値を切り替える。
 */
export function Orizuru({ tone = 'kinu', className, ...props }: OrizuruProps) {
  return (
    <svg
      viewBox={ORIZURU_VIEWBOX}
      width={200}
      height={130}
      className={['wa-orizuru', className].filter(Boolean).join(' ')}
      data-tone={tone}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <g strokeWidth={tone === 'line' ? 1 : 0.6} strokeLinejoin="round">
        {ORIZURU_FACETS.map((facet) => (
          <polygon
            key={facet.name}
            points={facet.points}
            fill={tone === 'line' ? 'none' : `var(--zuru-${facet.shade})`}
            stroke="var(--zuru-line)"
          />
        ))}
      </g>
    </svg>
  )
}
