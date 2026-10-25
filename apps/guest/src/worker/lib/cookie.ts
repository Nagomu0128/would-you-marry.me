// Cookie の名前と属性（docs/spec/api.md「Cookie」）。ドメイン属性は付けない
import { COUPLE_PENDING_COOKIE_MAX_AGE_SECONDS, SESSION_COOKIE_MAX_AGE_SECONDS } from '@wym/shared'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

export type SessionKind = 'guest' | 'couple'

export const COUPLE_PENDING_COOKIE = 'wym_couple_pending'
export const COUPLE_PENDING_COOKIE_PATH = '/api/couple'

/**
 * `wym_g_{tenantId}`（参加者）、`wym_c_{tenantId}`（新郎新婦）。
 * `tenantId` は UUID の形を確認済みのものだけを渡すこと（lib/ids.ts の `isUuid`）
 */
export function sessionCookieName(kind: SessionKind, tenantId: string): string {
  return `${kind === 'guest' ? 'wym_g_' : 'wym_c_'}${tenantId}`
}

export function readSessionCookie(c: Context, kind: SessionKind, tenantId: string) {
  return getCookie(c, sessionCookieName(kind, tenantId))
}

/** LAN 上の HTTP 開発サーバーでもセッションを保存できるようにする。公開ホストでは Secure を維持する。 */
function shouldSetSecureCookie(c: Context): boolean {
  const url = new URL(c.req.url)
  if (url.protocol !== 'http:') return true
  const host = url.hostname
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return false
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return false
  const secondOctet = /^172\.(\d{1,3})\./.exec(host)?.[1]
  return secondOctet === undefined || Number(secondOctet) < 16 || Number(secondOctet) > 31
}

export function setSessionCookie(
  c: Context,
  kind: SessionKind,
  tenantId: string,
  sessionId: string,
): void {
  setCookie(c, sessionCookieName(kind, tenantId), sessionId, {
    httpOnly: true,
    secure: shouldSetSecureCookie(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  })
}

export function readCouplePendingCookie(c: Context) {
  return getCookie(c, COUPLE_PENDING_COOKIE)
}

export function setCouplePendingCookie(c: Context, token: string): void {
  setCookie(c, COUPLE_PENDING_COOKIE, token, {
    httpOnly: true,
    secure: shouldSetSecureCookie(c),
    sameSite: 'Lax',
    path: COUPLE_PENDING_COOKIE_PATH,
    maxAge: COUPLE_PENDING_COOKIE_MAX_AGE_SECONDS,
  })
}

export function deleteCouplePendingCookie(c: Context): void {
  deleteCookie(c, COUPLE_PENDING_COOKIE, {
    path: COUPLE_PENDING_COOKIE_PATH,
    secure: shouldSetSecureCookie(c),
  })
}
