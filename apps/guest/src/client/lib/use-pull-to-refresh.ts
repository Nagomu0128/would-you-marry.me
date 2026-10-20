import { PULL_TRIGGER } from '@wym/ui'
import { useEffect, useRef, useState } from 'react'

const PULL_MAX = 80

/**
 * 画面を下に引っ張って最新に更新する（D-24）。ページの一番上にいるときだけ働く。
 * `enabled` が false（拡大表示を開いているときなど）の間は何もしない。
 * 戻り値の `distance` は引っ張っている量、`refreshing` は更新中。
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void, enabled: boolean) {
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh
  const busy = useRef(false)

  useEffect(() => {
    if (!enabled) return
    let startY: number | null = null
    let pulled = 0

    // ブラウザ自身の引っ張って再読み込みと重ならないようにする
    const root = document.documentElement
    const previous = root.style.overscrollBehaviorY
    root.style.overscrollBehaviorY = 'contain'

    const reset = () => {
      startY = null
      pulled = 0
      setDistance(0)
    }

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      startY =
        event.touches.length === 1 && touch && window.scrollY <= 0 && !busy.current
          ? touch.clientY
          : null
    }

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (startY === null || !touch) return
      if (event.touches.length > 1 || window.scrollY > 0) {
        reset()
        return
      }
      pulled = Math.min(Math.max((touch.clientY - startY) * 0.5, 0), PULL_MAX)
      setDistance(pulled)
    }

    const onTouchEnd = () => {
      const shouldRefresh = startY !== null && pulled >= PULL_TRIGGER
      reset()
      if (!shouldRefresh || busy.current) return
      busy.current = true
      setRefreshing(true)
      Promise.resolve(onRefreshRef.current()).finally(() => {
        busy.current = false
        setRefreshing(false)
      })
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', reset)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', reset)
      root.style.overscrollBehaviorY = previous
    }
  }, [enabled])

  return { distance, refreshing }
}
