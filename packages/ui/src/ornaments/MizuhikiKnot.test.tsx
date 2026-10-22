import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  MIZUHIKI_KNOT_PATH,
  MIZUHIKI_VIEWBOX,
  MIZUHIKI_WEAVE,
  MIZUHIKI_WEAVE_PATCH,
  MizuhikiKnot,
} from './MizuhikiKnot'

describe('MizuhikiKnot（あわじ結び）', () => {
  it('読み上げない装飾として、決まった viewBox で描く', () => {
    const { container } = render(<MizuhikiKnot />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('viewBox', MIZUHIKI_VIEWBOX)
  })

  it('8 か所の交差それぞれを、上になる紐の区間で編み上げる', () => {
    expect(MIZUHIKI_WEAVE).toHaveLength(8)
    expect(MIZUHIKI_WEAVE_PATCH.match(/M/g)).toHaveLength(8)
    const { container } = render(<MizuhikiKnot strands="five" />)
    expect(container.querySelectorAll('mask')).toHaveLength(8)
    const woven = container.querySelectorAll('g[mask]')
    expect(woven).toHaveLength(8)
    // 5 本どりは 6 層（切れ目・金・影・紅・影・金）を重ねる
    for (const group of woven) expect(group.querySelectorAll('path')).toHaveLength(6)
    const knotLayers = Array.from(container.querySelectorAll('svg > path')).filter(
      (path) => path.getAttribute('d') === MIZUHIKI_KNOT_PATH,
    )
    expect(knotLayers).toHaveLength(6)
  })

  it('細い表示は層を減らす', () => {
    const one = render(<MizuhikiKnot strands="one" />).container
    expect(one.querySelectorAll('g[mask]')[0]?.querySelectorAll('path')).toHaveLength(2)
    const three = render(<MizuhikiKnot strands="three" />).container
    expect(three.querySelectorAll('g[mask]')[0]?.querySelectorAll('path')).toHaveLength(4)
  })

  it('同じ画面に何個置いても、グラデーションとマスクの id が重ならない', () => {
    const { container } = render(
      <>
        <MizuhikiKnot />
        <MizuhikiKnot tone="on-dark" />
      </>,
    )
    const ids = Array.from(container.querySelectorAll('[id]'), (el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
    // 参照している id はすべて同じ svg の中にある
    for (const svg of container.querySelectorAll('svg')) {
      const own = new Set(Array.from(svg.querySelectorAll('[id]'), (el) => el.id))
      const refs = Array.from(svg.querySelectorAll('[mask], [stroke^="url("]'), (el) =>
        (el.getAttribute('mask') ?? el.getAttribute('stroke') ?? '').replace(/^url\(#|\)$/g, ''),
      )
      for (const ref of refs) expect(own.has(ref)).toBe(true)
    }
  })

  it('濃い面では紅の代わりに淡い金を使う', () => {
    const { container } = render(<MizuhikiKnot tone="on-dark" />)
    const strokes = Array.from(container.querySelectorAll('svg > path'), (p) =>
      p.getAttribute('stroke'),
    )
    expect(strokes).toContain('var(--color-gold-light)')
    expect(strokes).not.toContain('var(--color-accent)')
  })
})
