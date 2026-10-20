// API エラーの振り分け（messages.md「表示する場所」）。振り分けはこのファイルの 1 か所だけ。
//   UNAUTHENTICATED / TENANT_NOT_FOUND / TENANT_SUSPENDED / PERIOD_ENDED / COUPLE_LINK_INVALID → /error?code=...
//   NICKNAME_REQUIRED → /t/:tenantId/nickname
//   通信エラー → 画面内に ErrorState（呼び出し側が出す）
//   それ以外 → トースト

import type { ErrorCode } from '@wym/shared'
import { type ErrorAudience, errorMessage, ja, useToast } from '@wym/ui'
import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ApiClientError, NetworkError } from './api'

const REDIRECT_TO_ERROR_PAGE: ReadonlySet<ErrorCode> = new Set([
  'UNAUTHENTICATED',
  'TENANT_NOT_FOUND',
  'TENANT_SUSPENDED',
  'PERIOD_ENDED',
  'COUPLE_LINK_INVALID',
])

export type ApiErrorAction =
  | { type: 'redirect'; to: string }
  | { type: 'network' }
  | { type: 'toast'; message: string }

/** `/error?code=...`（新郎新婦向けは `&audience=couple`） */
export function errorPagePath(code: ErrorCode, audience: ErrorAudience = 'guest'): string {
  const query = new URLSearchParams({ code })
  if (audience === 'couple') query.set('audience', 'couple')
  return `/error?${query.toString()}`
}

/** エラーをどう扱うかを決める（純粋な関数） */
export function resolveApiError(
  error: unknown,
  options: { tenantId?: string | undefined; audience?: ErrorAudience } = {},
): ApiErrorAction {
  const audience = options.audience ?? 'guest'
  if (error instanceof NetworkError) return { type: 'network' }
  if (error instanceof ApiClientError) {
    if (REDIRECT_TO_ERROR_PAGE.has(error.code)) {
      return { type: 'redirect', to: errorPagePath(error.code, audience) }
    }
    if (error.code === 'NICKNAME_REQUIRED' && options.tenantId) {
      return { type: 'redirect', to: `/t/${encodeURIComponent(options.tenantId)}/nickname` }
    }
    const params: { remainingAttempts?: number; minutes?: number } = {}
    if (error.detail.remainingAttempts !== undefined) {
      params.remainingAttempts = error.detail.remainingAttempts
    }
    if (error.detail.retryAfterSeconds !== undefined) {
      params.minutes = Math.max(1, Math.ceil(error.detail.retryAfterSeconds / 60))
    }
    return {
      type: 'toast',
      message: errorMessage(error.code, audience, params) ?? ja.errors.guest.INTERNAL_ERROR,
    }
  }
  return { type: 'toast', message: ja.errors.guest.INTERNAL_ERROR }
}

/**
 * API エラーを扱う関数を返す。遷移とトーストはここで行い、結果の種類を返す。
 * - 'redirect': 別の画面へ移動した（呼び出し側は何もしない）
 * - 'network': 通信エラー。呼び出し側が画面内に ErrorState（もう一度試す）を出す
 * - 'toast': トーストを出した
 * 新郎新婦用ページでは `{ audience: 'couple' }` を渡す。
 */
export function useApiErrorHandler(
  options: { audience?: ErrorAudience } = {},
): (error: unknown) => ApiErrorAction['type'] {
  const navigate = useNavigate()
  const toast = useToast()
  const { tenantId } = useParams()
  const audience = options.audience ?? 'guest'

  return useCallback(
    (error: unknown) => {
      const action = resolveApiError(error, { tenantId, audience })
      if (action.type === 'redirect') navigate(action.to, { replace: true })
      else if (action.type === 'toast') toast.show(action.message)
      return action.type
    },
    [navigate, toast, tenantId, audience],
  )
}
