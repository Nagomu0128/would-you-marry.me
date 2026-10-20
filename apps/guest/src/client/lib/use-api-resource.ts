import { type DependencyList, useCallback, useEffect, useRef, useState } from 'react'
import { useApiErrorHandler } from './error-handling'

export type ApiResource<T> =
  | { state: 'loading' }
  | { state: 'ready'; data: T }
  | { state: 'error'; network: boolean }

/**
 * 画面を開いたときのデータ取得。読み込み中 → 成功 / 失敗。
 * 失敗の扱いは useApiErrorHandler と同じ（遷移・トースト）。'error' のときは画面内に
 * `<ErrorState onRetry={reload} />` を出す（通信エラー以外でもトーストと合わせて出す）。
 * `load` は deps が変わったときだけ呼び直す。
 */
export function useApiResource<T>(
  load: () => Promise<T>,
  deps: DependencyList,
): ApiResource<T> & { reload: () => void } {
  const [resource, setResource] = useState<ApiResource<T>>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const handleError = useApiErrorHandler()
  const loadRef = useRef(load)
  loadRef.current = load
  const handleRef = useRef(handleError)
  handleRef.current = handleError

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps は呼び出し側が渡す。attempt は再試行の合図
  useEffect(() => {
    let cancelled = false
    setResource({ state: 'loading' })
    loadRef
      .current()
      .then((data) => {
        if (!cancelled) setResource({ state: 'ready', data })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const type = handleRef.current(error)
        if (type !== 'redirect') setResource({ state: 'error', network: type === 'network' })
      })
    return () => {
      cancelled = true
    }
  }, [...deps, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { ...resource, reload }
}
