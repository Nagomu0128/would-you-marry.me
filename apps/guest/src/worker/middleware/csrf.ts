import { ApiError } from '@wym/shared'
import type { MiddlewareHandler } from 'hono'

const SAFE_METHODS = new Set(['GET', 'HEAD'])

/**
 * 状態を変えるリクエスト（GET・HEAD 以外）は、Origin ヘッダーがリクエストのオリジンと
 * 一致しなければ FORBIDDEN（CSRF 対策）。Origin がないリクエストも拒否する。
 */
export const csrf: MiddlewareHandler = async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const origin = c.req.header('Origin')
    if (!origin || origin !== new URL(c.req.url).origin) {
      throw new ApiError('FORBIDDEN', 'invalid origin')
    }
  }
  await next()
}
