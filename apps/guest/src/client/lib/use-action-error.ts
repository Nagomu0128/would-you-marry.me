import { ja, useToast } from '@wym/ui'
import { useCallback } from 'react'
import { useApiErrorHandler } from './error-handling'

/**
 * 操作（いいね・削除・更新など）の失敗の扱い。`useApiErrorHandler` に加えて、
 * 通信エラーのときもトーストを出す（画面内の ErrorState を出さない操作のため）。
 */
export function useApiActionErrorHandler(): (error: unknown) => void {
  const handleError = useApiErrorHandler()
  const toast = useToast()
  return useCallback(
    (error: unknown) => {
      if (handleError(error) === 'network') toast.show(ja.errors.network)
    },
    [handleError, toast],
  )
}
