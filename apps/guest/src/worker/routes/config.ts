import type { ConfigResponse } from '@wym/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../types'

export const configRoutes = new Hono<AppEnv>()

/** GET /api/config: 問い合わせ先（FR-G-15）。認証不要。本番ではシークレットで登録する */
configRoutes.get('/', (c) => {
  const body: ConfigResponse = { contactEmail: c.env.CONTACT_EMAIL ?? '' }
  return c.json(body)
})
