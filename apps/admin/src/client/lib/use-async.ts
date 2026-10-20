import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiClientError } from './api'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: ApiClientError }
  | { status: 'ready'; data: T }

/** 画面の読み込み。`key` が変わるか `reload()` を呼ぶと読み直す */
export function useAsync<T>(fn: () => Promise<T>, key: string) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  // biome-ignore lint/correctness/useExhaustiveDependencies: key と version で読み直しを制御する
  useEffect(() => {
    let cancelled = false
    fnRef.current().then(
      (data) => {
        if (!cancelled) setState({ status: 'ready', data })
      },
      (error: unknown) => {
        if (cancelled) return
        const e =
          error instanceof ApiClientError
            ? error
            : new ApiClientError(0, 'NETWORK', 'network error')
        setState({ status: 'error', error: e })
      },
    )
    return () => {
      cancelled = true
    }
  }, [key, version])

  /** 読み込み中の表示に戻さず、裏で読み直す */
  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setVersion((v) => v + 1)
  }, [])

  return { state, setState, refresh, retry }
}
