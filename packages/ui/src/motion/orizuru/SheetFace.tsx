import { type CSSProperties, useId, useState } from 'react'

// 芳名帳の一頁（360 × 252）。右から「御芳名」の見出し、名前の欄、ほかの方の欄が縦に並ぶ。
// 左の 108 は折るときに裏へ回る余り。座標は paper.ts の SHEET_RATIO と同じ比率。
export const SHEET_VIEWBOX = { width: 360, height: 252 }

const FRAME = { outer: 8, inner: 11.5 }
/** 名前を書く欄（縦の範囲と、一行・二行のときの中心） */
const NAME = { top: 30, bottom: 222, single: 250, double: [272, 229] as const }
const HEADING_X = 331
const RULES = [190, 152, 114, 76, 38]
const MAX_GLYPHS = 20

let segmenter: Intl.Segmenter | undefined

/** 書記素ごとに分ける（結合した絵文字も 1 文字） */
export function splitGlyphs(text: string): string[] {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return Array.from(segmenter.segment(text.trim()), (s) => s.segment).slice(0, MAX_GLYPHS)
}

function advance(glyph: string): number {
  if (/^\s+$/u.test(glyph)) return 0.5
  // 半角の英数字・記号は縦に詰めて並べる
  return /^[ -~｡-ﾟ]$/u.test(glyph) ? 0.64 : 1
}

type GlyphStyle = CSSProperties & { '--oz-ink-delay'?: string }

export type GlyphPlacement = { glyph: string; x: number; y: number; size: number }

/** 名前を縦書きで欄に収める。短い名前は大きく一行、長い名前は二行に分ける */
export function layoutName(glyphs: readonly string[]): GlyphPlacement[] {
  if (glyphs.length === 0) return []
  const span = NAME.bottom - NAME.top
  const total = (list: readonly string[]) => list.reduce((sum, g) => sum + advance(g) * 1.04, 0)
  const single = Math.min(46, span / total(glyphs))
  const columns =
    single >= 25 || glyphs.length < 2
      ? [glyphs]
      : [glyphs.slice(0, Math.ceil(glyphs.length / 2)), glyphs.slice(Math.ceil(glyphs.length / 2))]
  const size =
    columns.length === 1 ? single : Math.min(38, span / Math.max(...columns.map((c) => total(c))))
  const height = Math.max(...columns.map((c) => total(c))) * size
  const top = NAME.top + (span - height) / 2
  return columns.flatMap((column, ci) => {
    const x = columns.length === 1 ? NAME.single : (NAME.double[ci] ?? NAME.single)
    let cursor = top
    return column.map((glyph) => {
      const step = advance(glyph) * 1.04 * size
      const placement = { glyph, x, y: cursor + step / 2, size }
      cursor += step
      return placement
    })
  })
}

export type SheetFaceProps = {
  /** 入力中の名前（読み上げない鏡像） */
  name: string
  /** 「御芳名」 */
  heading: string
  /** 空のときに薄墨で出す案内 */
  placeholder: string
  /** 書いた文字に墨がにじむ（入力中の芳名帳）。折るときの紙は止まった絵で描く */
  live?: boolean
}

/** 芳名帳の紙の絵。入力中の紙と、折るときの紙の両方で同じものを描く */
export function SheetFace({ name, heading, placeholder, live = false }: SheetFaceProps) {
  const id = `oz-${useId().replace(/[^\w-]/g, '')}`
  const glyphs = layoutName(splitGlyphs(name))
  // 開いたときにすでにある文字は、順に墨を入れる。あとから書いた文字はすぐににじむ
  const [initialCount] = useState(glyphs.length)
  const headingGlyphs = Array.from(heading)

  return (
    <svg
      className="oz-face-art"
      viewBox={`0 0 ${SHEET_VIEWBOX.width} ${SHEET_VIEWBOX.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      data-live={live || undefined}
    >
      <defs>
        {/* 和紙の繊維に沿って墨が少しにじむ */}
        <filter id={`${id}-bleed`} x="-40%" y="-40%" width="180%" height="180%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="2.4" result="spread" />
          <feMorphology in="spread" operator="dilate" radius="0.5" result="wide" />
          <feGaussianBlur in="wide" stdDeviation="1.1" />
        </filter>
      </defs>
      <rect
        className="oz-frame"
        x={FRAME.outer}
        y={FRAME.outer}
        width={SHEET_VIEWBOX.width - FRAME.outer * 2}
        height={SHEET_VIEWBOX.height - FRAME.outer * 2}
      />
      <rect
        className="oz-frame oz-frame-inner"
        x={FRAME.inner}
        y={FRAME.inner}
        width={SHEET_VIEWBOX.width - FRAME.inner * 2}
        height={SHEET_VIEWBOX.height - FRAME.inner * 2}
      />
      {/* 見出しの欄の二重罫 */}
      <line
        className="oz-rule-kin"
        x1={314}
        x2={314}
        y1={FRAME.inner}
        y2={SHEET_VIEWBOX.height - FRAME.inner}
      />
      <line
        className="oz-rule-kin oz-rule-thin"
        x1={311}
        x2={311}
        y1={FRAME.inner}
        y2={SHEET_VIEWBOX.height - FRAME.inner}
      />
      {RULES.map((x) => (
        <line
          key={x}
          className="oz-rule"
          x1={x}
          x2={x}
          y1={FRAME.inner}
          y2={SHEET_VIEWBOX.height - FRAME.inner}
        />
      ))}
      <g className="oz-heading">
        {headingGlyphs.map((glyph, i) => (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: 見出しの文字は固定で、同じ字が並ぶこともある
            key={i}
            x={HEADING_X}
            y={44 + i * 24}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {glyph}
          </text>
        ))}
      </g>
      <g className="oz-placeholder" data-hidden={glyphs.length > 0 || undefined}>
        {Array.from(placeholder).map((glyph, i) => (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: 案内の文字は固定
            key={i}
            x={NAME.single}
            y={84 + i * 38}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {glyph}
          </text>
        ))}
      </g>
      <g className="oz-name">
        {glyphs.map((g, i) => {
          const style: GlyphStyle = {
            transform: `translate(${g.x}px, ${g.y}px) scale(${g.size / 40})`,
          }
          if (live && i < initialCount) style['--oz-ink-delay'] = `${0.18 + i * 0.07}s`
          return (
            <g
              // biome-ignore lint/suspicious/noArrayIndexKey: 位置と字で見分ける。書き足した字だけが新しくにじむ
              key={`${i}-${g.glyph}`}
              className="oz-glyph"
              style={style}
            >
              <text
                className="oz-ink-bleed"
                filter={`url(#${id}-bleed)`}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {g.glyph}
              </text>
              <text className="oz-ink" textAnchor="middle" dominantBaseline="central">
                {g.glyph}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
