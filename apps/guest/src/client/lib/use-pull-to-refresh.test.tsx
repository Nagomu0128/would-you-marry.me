import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePullToRefresh } from './use-pull-to-refresh'

function touch(type: 'touchstart' | 'touchmove' | 'touchend', y: number) {
  const event = new Event(type) as Event & { touches: { clientY: number }[] }
  event.touches = type === 'touchend' ? [] : [{ clientY: y }]
  act(() => {
    window.dispatchEvent(event)
  })
}

afterEach(() => {
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
})

describe('usePullToRefresh', () => {
  it('ページの一番上から十分に引っ張って離すと更新する', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    renderHook(() => usePullToRefresh(onRefresh, true))
    touch('touchstart', 100)
    touch('touchmove', 260)
    touch('touchend', 260)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('引っ張りが足りないと更新しない', () => {
    const onRefresh = vi.fn()
    renderHook(() => usePullToRefresh(onRefresh, true))
    touch('touchstart', 100)
    touch('touchmove', 140)
    touch('touchend', 140)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('ページの一番上でないときは更新しない', () => {
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true })
    const onRefresh = vi.fn()
    renderHook(() => usePullToRefresh(onRefresh, true))
    touch('touchstart', 100)
    touch('touchmove', 300)
    touch('touchend', 300)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('無効の間（拡大表示を開いているときなど）は更新しない', () => {
    const onRefresh = vi.fn()
    renderHook(() => usePullToRefresh(onRefresh, false))
    touch('touchstart', 100)
    touch('touchmove', 300)
    touch('touchend', 300)
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
