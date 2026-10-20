import { errorMessage, ja } from '@wym/ui'
import { ApiClientError } from './api'

/** API のエラーを、messages.md の文言にする（トースト・画面内用） */
export function messageOf(error: unknown): string {
  if (!(error instanceof ApiClientError)) return ja.errors.guest.INTERNAL_ERROR
  if (error.code === 'NETWORK') return ja.errors.network
  return errorMessage(error.code, 'guest') ?? ja.errors.guest.INTERNAL_ERROR
}
