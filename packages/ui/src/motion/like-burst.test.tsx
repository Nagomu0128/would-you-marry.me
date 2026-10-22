import { act, render, screen } from '@testing-library/react'
import { domAnimation, LazyMotion } from 'motion/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIKE_BURST_DURATION } from './durations'
import { LikeBurst } from './LikeBurst'

// 再生・取り消し・動きを減らす設定の基本は motion.test.tsx。ここでは中身の構成を確かめる

const reducedMotion = vi.hoisted(() => ({ value: false }))

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => reducedMotion.value }
})

const wrap = (ui: ReactElement) => <LazyMotion features={domAnimation}>{ui}</LazyMotion>

beforeEach(() => {
  reducedMotion.value = false
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('LikeBurst の構成', () => {
  it('長さは 0.9 秒', () => {
    expect(LIKE_BURST_DURATION).toBe(0.9)
  })

  it('梅の花・花びら・金の粒を、多すぎない数で散らす', () => {
    render(wrap(<LikeBurst active />))
    const pieces = screen.getAllByTestId('like-grain')
    expect(pieces.length).toBeGreaterThanOrEqual(10)
    expect(pieces.length).toBeLessThanOrEqual(40)
    const kinds = new Set(pieces.map((p) => p.getAttribute('data-kind')))
    expect(kinds).toEqual(new Set(['blossom', 'petal', 'grain']))
    // 梅の花は 5 弁
    const blossom = pieces.find((p) => p.getAttribute('data-kind') === 'blossom')
    expect(blossom?.querySelectorAll('circle:not(.wa-like-stamen)')).toHaveLength(5)
  })

  it('散り方は毎回同じ（配置を固定している）', () => {
    const sizes = () =>
      screen.getAllByTestId('like-grain').map((p) => `${p.style.width}x${p.style.height}`)
    const first = render(wrap(<LikeBurst active />))
    const a = sizes()
    first.unmount()
    render(wrap(<LikeBurst active />))
    expect(sizes()).toEqual(a)
  })

  it('読み上げず、位置の調整用のクラスを受け取る', () => {
    render(wrap(<LikeBurst active className="origin-left" />))
    const burst = screen.getByTestId('like-burst')
    expect(burst).toHaveAttribute('aria-hidden', 'true')
    expect(burst).toHaveClass('wa-like', 'origin-left')
  })

  it('終わって呼び出し側が active を戻すと、DOM から消える', () => {
    function Harness({ active }: { active: boolean }) {
      return wrap(<LikeBurst active={active} />)
    }
    const { rerender } = render(<Harness active />)
    act(() => {
      vi.advanceTimersByTime(LIKE_BURST_DURATION * 1000)
    })
    rerender(<Harness active={false} />)
    expect(screen.queryByTestId('like-burst')).toBeNull()
    expect(screen.queryAllByTestId('like-grain')).toHaveLength(0)
  })
})
