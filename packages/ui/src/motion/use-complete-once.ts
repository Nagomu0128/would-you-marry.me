import { useCallback, useEffect, useRef } from 'react'

// onComplete を一度だけ呼ぶ。最新のコールバックを使い、再生し直すときは reset() する
export function useCompleteOnce(onComplete?: () => void) {
  const callback = useRef(onComplete)
  const done = useRef(false)

  useEffect(() => {
    callback.current = onComplete
  })

  const complete = useCallback(() => {
    if (done.current) return
    done.current = true
    callback.current?.()
  }, [])

  const reset = useCallback(() => {
    done.current = false
  }, [])

  return { complete, reset }
}
