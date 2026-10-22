import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORIZURU_FACETS } from '../../ornaments/Orizuru'
import { BENI, FACET_NAMES, morphFacets, poseFacets, REST_POSE, TRIANGLE } from './crane'
import { mainFlight, planFlight } from './flight'
import { apply, hexToRgb, project, rgbToCss } from './math'
import {
  activeFaces,
  endScaleFor,
  FOLD_BEATS,
  foldedTriangle,
  foldFrame,
  PERSPECTIVE,
  type SheetSize,
} from './paper'
import { layoutName, splitGlyphs } from './SheetFace'
import { useOrizuruSequence } from './use-orizuru-sequence'

const reducedMotion = vi.hoisted(() => ({ value: false }))

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => reducedMotion.value }
})

const size: SheetSize = { width: 342, height: 239.4 }
const center: [number, number] = [195, 420]
const unit = 1.15
const endScale = endScaleFor(size, unit)

function parse(points: string) {
  return points.split(' ').map((pair) => pair.split(',').map(Number))
}

describe('紙を折る（paper）', () => {
  it('折り始めは、芳名帳の紙がそのままの位置・明るさで表を向いている', () => {
    const frame = foldFrame(0, size, center, endScale, center)
    expect(frame.faces).toHaveLength(1)
    const sheet = frame.faces[0]
    expect(sheet?.id).toBe('sheet')
    expect(sheet?.side).toBe('front')
    expect(sheet?.lighting.shade).toBeCloseTo(0, 5)
    expect(sheet?.lighting.sheen).toBeCloseTo(0, 5)
    const topLeft = apply(sheet?.matrix ?? [], [0, 0, 0])
    expect(topLeft[0]).toBeCloseTo(center[0] - size.width / 2, 5)
    expect(topLeft[1]).toBeCloseTo(center[1] - size.height / 2, 5)
    expect(frame.restShadow).toBe(1)
  })

  it('正方形に整え、三角に折り、さらに半分に折る順に面が替わる', () => {
    const B = FOLD_BEATS
    expect(activeFaces(0.1)).toEqual(['sheet'])
    expect(activeFaces((B.squareStart + B.squareEnd) / 2)).toEqual(['strip', 'square'])
    expect(activeFaces((B.squareEnd + B.diagonalEnd) / 2)).toEqual(['lower', 'flap'])
    expect(activeFaces((B.diagonalEnd + B.halfEnd) / 2)).toEqual(['right', 'left'])
    expect(activeFaces(B.halfEnd)).toEqual([])
  })

  it('折り返した面は、途中で裏（紅）が見え、折り目で陰影が変わる', () => {
    const B = FOLD_BEATS
    const flapAt = (c: number) =>
      foldFrame(c, size, center, endScale, center).faces.find((f) => f.id === 'flap')
    expect(flapAt(B.squareEnd + 0.01)?.side).toBe('front')
    expect(flapAt(B.diagonalEnd - 0.01)?.side).toBe('back')
    const middle = flapAt((B.squareEnd + B.diagonalEnd) / 2)
    expect((middle?.lighting.shade ?? 0) + (middle?.lighting.sheen ?? 0)).toBeGreaterThan(0.05)
  })

  it('半分に折った三角は、底辺が水平で、鶴の座標の三角と同じ大きさになる', () => {
    const [left, right, apex] = foldedTriangle(size, center, endScale, center)
    expect(left[1]).toBeCloseTo(right[1], 3)
    expect(apex[1]).toBeLessThan(left[1])
    expect(right[0] - left[0]).toBeCloseTo(96 * unit, 1)
    expect(apex[0]).toBeCloseTo((left[0] + right[0]) / 2, 3)
  })

  it('JS の投影は CSS の perspective と同じ式', () => {
    expect(project([100, 100, 0], [50, 50], PERSPECTIVE)).toEqual([100, 100])
    const near = project([100, 100, 110], [50, 50], PERSPECTIVE)
    expect(near[0]).toBeCloseTo(50 + 50 / (1 - 110 / PERSPECTIVE), 6)
  })
})

describe('鶴（crane）', () => {
  it('折り上がりの形は ORIZURU_FACETS と一致する', () => {
    const facets = morphFacets(1, TRIANGLE)
    ORIZURU_FACETS.forEach((facet, i) => {
      const expected = parse(facet.points)
      facets[i]?.points.forEach((p, j) => {
        expect(p[0]).toBeCloseTo(expected[j]?.[0] ?? Number.NaN, 4)
        expect(p[1]).toBeCloseTo(expected[j]?.[1] ?? Number.NaN, 4)
      })
      expect(facets[i]?.fill).toBe(rgbToCss(hexToRgb(BENI[facet.shade])))
    })
  })

  it('三角のときは、どの面も同じ紅の一枚に重なって見える', () => {
    const facets = morphFacets(0, TRIANGLE)
    for (const facet of facets) {
      expect(facet.fill).toBe(rgbToCss(hexToRgb(BENI.mid)))
      expect(facet.edge).toBe(0)
    }
  })

  it('飛ぶ鶴の静止した姿も ORIZURU_FACETS と同じ形・色・重なり順', () => {
    const facets = poseFacets(REST_POSE)
    expect(facets.map((f) => f.name)).toEqual(
      expect.arrayContaining(FACET_NAMES as unknown[] as string[]),
    )
    for (const facet of facets) {
      const design = ORIZURU_FACETS.find((f) => f.name === facet.name)
      const expected = parse(design?.points ?? '')
      facet.points.forEach((p, j) => {
        expect(p[0]).toBeCloseTo(expected[j]?.[0] ?? Number.NaN, 4)
        expect(p[1]).toBeCloseTo(expected[j]?.[1] ?? Number.NaN, 4)
      })
      expect(facet.fill).toBe(rgbToCss(hexToRgb(BENI[design?.shade ?? 'mid'])))
    }
    // 奥の羽が最初、手前の羽が最後に描かれる
    expect(facets[0]?.name).toBe('wing-back')
    expect(facets.at(-1)?.name).toBe('wing-front')
  })

  it('羽を打ち下ろすと、羽の先が下がる', () => {
    const tip = (wing: number) =>
      poseFacets({ ...REST_POSE, wing }).find((f) => f.name === 'wing-front')?.points[1][1] ?? 0
    expect(tip(1.2)).toBeGreaterThan(tip(0) + 40)
  })
})

describe('飛ぶ道筋（flight）', () => {
  const viewport = { width: 390, height: 844 }
  const plan = planFlight([195, 480], unit, viewport, 1)

  it('飛び立ちの瞬間は折り上がった場所にいて、終わりには画面の上の端の外に出ている', () => {
    const start = mainFlight(plan, 0)
    expect(start.x).toBeCloseTo(195, 5)
    expect(start.y).toBeCloseTo(480, 5)
    const end = mainFlight(plan, 1)
    expect(end.y).toBeLessThan(-40)
    expect(end.scale).toBeLessThan(0.5)
  })

  it('通信を待つ地点は、画面の上の方で、飛び終わるより前', () => {
    expect(plan.checkpoint).toBeGreaterThan(0.1)
    expect(plan.checkpoint).toBeLessThan(1)
    expect(mainFlight(plan, plan.checkpoint).y).toBeLessThan(480)
  })
})

describe('芳名帳の文字（SheetFace）', () => {
  it('一文字は大きく一行、長い名前は二行に分けて欄に収める', () => {
    const one = layoutName(splitGlyphs('桜'))
    expect(one).toHaveLength(1)
    expect(one[0]?.size).toBe(46)

    const long = layoutName(splitGlyphs('佐々木ひろみ新郎の大学時代の友人代表です'))
    expect(long).toHaveLength(20)
    expect(new Set(long.map((g) => g.x)).size).toBe(2)
    for (const g of long) {
      expect(g.y - g.size / 2).toBeGreaterThanOrEqual(29)
      expect(g.y + g.size / 2).toBeLessThanOrEqual(223)
    }
  })

  it('前後の空白を除き、書記素で分け、20 文字までを書く', () => {
    expect(splitGlyphs('  たろう ')).toEqual(['た', 'ろ', 'う'])
    expect(splitGlyphs('👨‍👩‍👧')).toHaveLength(1)
    expect(splitGlyphs('あ'.repeat(25))).toHaveLength(20)
  })
})

describe('useOrizuruSequence', () => {
  beforeEach(() => {
    reducedMotion.value = false
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('動きを減らす設定では演出を始めず、待たずに次へ進む', async () => {
    reducedMotion.value = true
    const { result } = renderHook(() => useOrizuruSequence('register'))
    act(() => result.current.begin())
    expect(result.current.active).toBe(false)
    await expect(result.current.depart()).resolves.toBeUndefined()
    await expect(result.current.restore()).resolves.toBeUndefined()
  })

  it('成功すると鶴が飛び去ってから解決し、紙は隠したまま', async () => {
    const { result } = renderHook(() => useOrizuruSequence('register'))
    act(() => result.current.begin())
    expect(result.current.active).toBe(true)
    expect(result.current.run?.outcome).toBe('pending')
    let departed = false
    let promise: Promise<void> = Promise.resolve()
    act(() => {
      promise = result.current.depart().then(() => {
        departed = true
      })
    })
    expect(result.current.run?.outcome).toBe('success')
    await Promise.resolve()
    expect(departed).toBe(false)
    act(() => result.current.settle('departed'))
    await promise
    expect(departed).toBe(true)
    expect(result.current.active).toBe(true)
  })

  it('失敗すると紙に戻ってから解決し、もう一度送信できる', async () => {
    const { result } = renderHook(() => useOrizuruSequence('change'))
    act(() => result.current.begin())
    expect(result.current.run?.variant).toBe('change')
    let promise: Promise<void> = Promise.resolve()
    act(() => {
      promise = result.current.restore()
    })
    expect(result.current.run?.outcome).toBe('failure')
    act(() => result.current.settle('restored'))
    await promise
    expect(result.current.active).toBe(false)
    act(() => result.current.begin())
    expect(result.current.active).toBe(true)
  })

  it('演出が止まっても、待ちすぎずに次へ進む', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useOrizuruSequence('register'))
    act(() => result.current.begin())
    let departed = false
    act(() => {
      void result.current.depart().then(() => {
        departed = true
      })
    })
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(departed).toBe(true)
  })
})
