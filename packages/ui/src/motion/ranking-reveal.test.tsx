import { act, render, screen } from '@testing-library/react'
import { domAnimation, LazyMotion } from 'motion/react'
import type { ReactElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { RankingReveal, RankingRevealItem } from './RankingReveal'

const reducedMotion = vi.hoisted(() => ({ value: false }))

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => reducedMotion.value }
})

const wrap = (ui: ReactElement) => <LazyMotion features={domAnimation}>{ui}</LazyMotion>

// happy-dom の Web Animations は破棄時に AbortError を投げるため、Motion に JS アニメーションを使わせる
beforeAll(() => {
  Reflect.deleteProperty(Element.prototype, 'animate')
})

beforeEach(() => {
  reducedMotion.value = false
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// 1 位は大きく、2・3 位は横並びの別の要素、4 位以下は一覧、という配置
const layout = (onComplete?: () => void) =>
  wrap(
    <RankingReveal count={5} onComplete={onComplete}>
      <RankingRevealItem rank={1}>
        <p>一位</p>
      </RankingRevealItem>
      <div>
        <RankingRevealItem rank={2}>
          <p>二位</p>
        </RankingRevealItem>
        <RankingRevealItem rank={3}>
          <p>三位</p>
        </RankingRevealItem>
      </div>
      <ol>
        <RankingRevealItem rank={4} as="li">
          <p>四位</p>
        </RankingRevealItem>
        <RankingRevealItem rank={5} as="li">
          <p>五位</p>
        </RankingRevealItem>
      </ol>
    </RankingReveal>,
  )

const delayOf = (text: string) => {
  const el = screen.getByText(text).closest('[data-testid="ranking-item"]')
  return Number(el?.getAttribute('data-delay'))
}

describe('RankingReveal', () => {
  it('ネストした配置でも 3 位 → 2 位 → 1 位 → 4 位以下の順の遅延になる', () => {
    render(layout())
    expect(delayOf('三位')).toBeLessThan(delayOf('二位'))
    expect(delayOf('二位')).toBeLessThan(delayOf('一位'))
    expect(delayOf('一位')).toBeLessThan(delayOf('四位'))
    expect(delayOf('四位')).toBe(delayOf('五位'))
  })

  it('全項目を描画し、王冠は 1 位だけに載る', () => {
    render(layout())
    expect(screen.getAllByTestId('ranking-item')).toHaveLength(5)
    const crowns = screen.getAllByTestId('crown')
    expect(crowns).toHaveLength(1)
    const first = screen.getByText('一位').closest('[data-testid="ranking-item"]')
    expect(first).toContainElement(crowns[0] ?? null)
  })

  it('順位の数字は描かない', () => {
    render(layout())
    expect(screen.queryByText('1')).toBeNull()
  })

  it('3 件未満でも遅延が詰まる', () => {
    render(
      wrap(
        <RankingReveal count={2}>
          <RankingRevealItem rank={1}>
            <p>一位</p>
          </RankingRevealItem>
          <RankingRevealItem rank={2}>
            <p>二位</p>
          </RankingRevealItem>
        </RankingReveal>,
      ),
    )
    expect(delayOf('二位')).toBe(0)
    expect(delayOf('一位')).toBeGreaterThan(0)
  })

  it('onComplete が 3 秒以内に一度だけ呼ばれる', () => {
    const onComplete = vi.fn()
    render(layout(onComplete))
    expect(onComplete).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('動きを減らす設定では内容をすぐ表示し（遅延なし）、すぐ onComplete を呼ぶ', () => {
    reducedMotion.value = true
    const onComplete = vi.fn()
    render(layout(onComplete))
    expect(screen.getAllByTestId('ranking-item')).toHaveLength(5)
    expect(delayOf('四位')).toBe(0)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('アンマウントするとタイマーを片付ける', () => {
    const onComplete = vi.fn()
    const { unmount } = render(layout(onComplete))
    unmount()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(onComplete).not.toHaveBeenCalled()
  })
})
