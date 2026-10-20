import { env, exports } from 'cloudflare:workers'
import {
  createDb,
  createGuest,
  createTenant,
  createVisitorSession,
  issueCoupleAccess,
  issueJoinToken,
  newId,
  setGuestNickname,
  updateTenant,
} from '@wym/db'
import {
  addDays,
  hashPasscode,
  randomSessionId,
  randomToken,
  sha256Hex,
  toJstDateString,
} from '@wym/shared'

export const ORIGIN = 'https://would-you-marry.me'

export const db = createDb(env.DB)

/** 開催日を今日（日本時間）からずらして求める。0 = 今日、-10 = 10 日前、10 = 10 日後 */
export function eventDateOffset(days: number): string {
  return addDays(toJstDateString(new Date()), days)
}

/** 開催日ごとの期間: 今日 = 参加受付期間、10 日前 = 閲覧期間、10 日後 = 準備期間、120 日前 = 新郎新婦閲覧期間 */
export const EVENT = {
  joining: 0,
  viewing: -10,
  preparation: 10,
  coupleOnly: -120,
  expired: -250,
} as const

export async function makeTenant(
  eventDays: number = EVENT.joining,
  options: { suspended?: boolean } = {},
) {
  const tenant = await createTenant(db, {
    name: `結婚式 ${newId().slice(0, 8)}`,
    eventDate: eventDateOffset(eventDays),
    createdBy: 'admin@example.com',
  })
  if (options.suspended) await updateTenant(db, tenant.id, { suspended: true })
  return tenant
}

export async function makeJoinToken(tenantId: string): Promise<string> {
  const token = randomToken()
  await issueJoinToken(db, tenantId, token)
  return token
}

export const PASSCODE = 'AB12CD34'

export async function makeCoupleAccess(tenantId: string) {
  const token = randomToken()
  const access = await issueCoupleAccess(db, tenantId, {
    token,
    passcodeHash: await hashPasscode(PASSCODE),
  })
  return { token, access }
}

/** 参加者とセッションを作り、Cookie ヘッダーの値を返す */
export async function makeGuestSession(tenantId: string, nickname?: string) {
  let guest = await createGuest(db, tenantId)
  if (nickname !== undefined) {
    const result = await setGuestNickname(db, tenantId, guest.id, {
      nickname,
      nicknameKey: nickname.trim(),
    })
    if (!result.ok) throw new Error('nickname is taken')
    guest = result.guest
  }
  const sessionId = randomSessionId()
  await createVisitorSession(db, {
    idHash: await sha256Hex(sessionId),
    tenantId,
    kind: 'guest',
    guestId: guest.id,
  })
  return { guest, sessionId, cookie: `wym_g_${tenantId}=${sessionId}` }
}

/** 新郎新婦のセッションを作り、Cookie ヘッダーの値を返す */
export async function makeCoupleSession(tenantId: string, coupleAccessId: string) {
  const sessionId = randomSessionId()
  await createVisitorSession(db, {
    idHash: await sha256Hex(sessionId),
    tenantId,
    kind: 'couple',
    coupleAccessId,
  })
  return { sessionId, cookie: `wym_c_${tenantId}=${sessionId}` }
}

export type RequestOptions = {
  method?: string
  cookie?: string
  /** 既定は同じオリジン。null で Origin ヘッダーなし */
  origin?: string | null
  json?: unknown
  /** multipart など。json と同時には使わない */
  body?: BodyInit
  headers?: Record<string, string>
}

/** guest Worker に直接リクエストする。リダイレクトは追わない */
export function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers)
  if (options.cookie) headers.set('Cookie', options.cookie)
  const origin = options.origin === undefined ? ORIGIN : options.origin
  if (origin !== null) headers.set('Origin', origin)
  let body: BodyInit | undefined = options.body
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.json)
  }
  return exports.default.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
      redirect: 'manual',
    }),
  )
}

export async function errorCode(res: Response): Promise<string> {
  const body = await res.json<{ error: { code: string } }>()
  return body.error.code
}

/** Set-Cookie ヘッダー（1 つ目）を名前・値・属性に分ける */
export function parseSetCookie(res: Response): { name: string; value: string; attrs: string[] } {
  const header = res.headers.get('set-cookie')
  if (!header) throw new Error('no Set-Cookie header')
  const [pair = '', ...attrs] = header.split(';').map((part) => part.trim())
  const eq = pair.indexOf('=')
  return { name: pair.slice(0, eq), value: pair.slice(eq + 1), attrs }
}
