import { createDb } from '@wym/db'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

/** `c.var.db`（Drizzle のクライアント）をリクエストごとに用意する */
export const dbMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('db', createDb(c.env.DB))
  await next()
}
