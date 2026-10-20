import type { ErrorCode } from '@wym/shared'
import type { Context } from 'hono'

export type ErrorAudience = 'guest' | 'couple'

/** エラー画面へのリダイレクト先。新郎新婦向けは `audience=couple` を付ける（SC-E1 の文言のため） */
export function errorPath(code: ErrorCode, audience: ErrorAudience = 'guest'): string {
  const params = new URLSearchParams({ code })
  if (audience === 'couple') params.set('audience', 'couple')
  return `/error?${params.toString()}`
}

/** トークンを含む URL への応答は、ブラウザやプロキシに残さない */
export function redirectNoStore(c: Context, path: string): Response {
  c.header('Cache-Control', 'no-store')
  return c.redirect(path, 302)
}
