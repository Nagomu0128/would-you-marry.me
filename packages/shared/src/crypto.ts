// Web Crypto だけで書く（ブラウザと Cloudflare Workers の両方で動く）

import { PASSCODE_LENGTH } from './limits'

/** Cloudflare Workers の Web Crypto で PBKDF2 に使える反復回数の上限 */
export const PBKDF2_ITERATIONS = 100_000
export const PBKDF2_SALT_BYTES = 16
const PBKDF2_HASH_BITS = 256

/** 読み間違えやすい 0/O、1/I/L を除いた大文字と数字（31 文字） */
export const PASSCODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 不正な入力なら null */
export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** 参加トークン・新郎新婦用トークン: 32 バイトの乱数（base64url） */
export function randomToken(): string {
  return bytesToBase64Url(randomBytes(32))
}

/** セッション ID: 256 ビットの乱数（base64url） */
export function randomSessionId(): string {
  return bytesToBase64Url(randomBytes(32))
}

/** SHA-256 の 16 進文字列（セッション ID のハッシュ） */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  let hex = ''
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, '0')
  return hex
}

/** 英数字のパスコード。偏りが出ないよう、範囲外の乱数は捨てて引き直す */
export function generatePasscode(length: number = PASSCODE_LENGTH): string {
  const size = PASSCODE_ALPHABET.length
  const limit = 256 - (256 % size) // これ以上の値は偏りの原因になるので捨てる
  let out = ''
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b >= limit) continue
      out += PASSCODE_ALPHABET.charAt(b % size)
      if (out.length === length) break
    }
  }
  return out
}

/** 定数時間の比較（長さが違えば false。長さは秘密でない前提） */
export function timingSafeEqual(a: Uint8Array | string, b: Uint8Array | string): boolean {
  const enc = new TextEncoder()
  const x = typeof a === 'string' ? enc.encode(a) : a
  const y = typeof b === 'string' ? enc.encode(b) : b
  let diff = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

async function pbkdf2(
  passcode: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passcode),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    PBKDF2_HASH_BITS,
  )
  return new Uint8Array(bits)
}

/** `pbkdf2-sha256$<反復回数>$<ソルト>$<ハッシュ>`（ソルトとハッシュは base64url） */
export async function hashPasscode(passcode: string): Promise<string> {
  const salt = randomBytes(PBKDF2_SALT_BYTES)
  const hash = await pbkdf2(passcode, salt, PBKDF2_ITERATIONS)
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`
}

/** 保存された形式が不正なら false。ハッシュの比較は定数時間 */
export async function verifyPasscode(passcode: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false
  const iterations = Number(parts[1])
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) {
    return false
  }
  const salt = base64UrlToBytes(parts[2] ?? '')
  const expected = base64UrlToBytes(parts[3] ?? '')
  if (!salt || !expected || salt.length === 0 || expected.length === 0) return false
  const actual = await pbkdf2(passcode, salt, iterations)
  return timingSafeEqual(actual, expected)
}
