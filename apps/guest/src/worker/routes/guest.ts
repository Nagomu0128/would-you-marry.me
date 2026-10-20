// 参加者向け API（/api/t/:tenantId/*）。index.ts の app.ts が `/api/t/:tenantId` に mount する。
//
// ルートの足し方（T08 など）:
//   1. routes/ に `new Hono<GuestEnv>()` のファイルを作る。ハンドラーでは `c.var.tenant`・
//      `c.var.guest`・`c.var.db` を使い、URL のテナント ID は使わない
//   2. 下の `requireNickname` の「あと」に `guestRoutes.route('/photos', photoRoutes)` のように足す
//      （`me` 系だけがニックネーム未登録でも通る。他は NICKNAME_REQUIRED になる）
import { Hono } from 'hono'
import { guestSession, requireNickname } from '../middleware/session'
import type { GuestEnv } from '../types'
import { guestContentRoutes } from './guest-content'
import { guestMeRoutes } from './guest-me'
import { photoRoutes } from './photos'

export const guestRoutes = new Hono<GuestEnv>()

// セッション → テナント → 停止中 → 期間
guestRoutes.use('*', guestSession)

// ニックネーム未登録でも使える
guestRoutes.route('/me', guestMeRoutes)

// ここから先は、ニックネーム登録済みの参加者だけ
guestRoutes.use('*', requireNickname)
guestRoutes.route('/', guestContentRoutes)
guestRoutes.route('/photos', photoRoutes)
