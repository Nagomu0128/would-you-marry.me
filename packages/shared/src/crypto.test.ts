import { describe, expect, it } from 'vitest'
import {
  base64UrlToBytes,
  bytesToBase64Url,
  generatePasscode,
  hashPasscode,
  PASSCODE_ALPHABET,
  PBKDF2_ITERATIONS,
  randomSessionId,
  randomToken,
  sha256Hex,
  timingSafeEqual,
  verifyPasscode,
} from './crypto'

describe('base64url', () => {
  it('往復できる（パディングなし、+ / を含まない）', () => {
    const bytes = new Uint8Array([251, 255, 254, 0, 1, 2, 3])
    const text = bytesToBase64Url(bytes)
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(text).toBe('-__-AAECAw')
    expect(base64UrlToBytes(text)).toEqual(bytes)
  })

  it('不正な入力は null', () => {
    expect(base64UrlToBytes('a+b')).toBeNull()
    expect(base64UrlToBytes('a')).toBeNull()
  })
})

describe('randomToken / randomSessionId', () => {
  it('32 バイトの base64url（43 文字）で、毎回違う', () => {
    const a = randomToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(base64UrlToBytes(a)).toHaveLength(32)
    expect(randomToken()).not.toBe(a)
  })

  it('セッション ID は 128 ビット以上', () => {
    const s = randomSessionId()
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(base64UrlToBytes(s)?.length).toBeGreaterThanOrEqual(16)
    expect(randomSessionId()).not.toBe(s)
  })
})

describe('sha256Hex', () => {
  it('既知の値と一致する', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('generatePasscode', () => {
  it('8 文字で、読み間違えやすい文字を含まない', () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePasscode()
      expect(p).toMatch(/^[A-Z2-9]{8}$/)
      expect(p).not.toMatch(/[01OIL]/)
    }
  })

  it('文字の候補は 31 文字で重複がない', () => {
    expect(PASSCODE_ALPHABET).toHaveLength(31)
    expect(new Set(PASSCODE_ALPHABET).size).toBe(31)
  })

  it('すべての文字が出る（偏りの大まかな確認）', () => {
    const counts = new Map<string, number>()
    const total = 31 * 400
    let seen = 0
    while (seen < total) {
      for (const c of generatePasscode(100)) counts.set(c, (counts.get(c) ?? 0) + 1)
      seen += 100
    }
    expect(counts.size).toBe(31)
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(250) // 期待値 400
      expect(n).toBeLessThan(560)
    }
  })

  it('長さを指定できる', () => {
    expect(generatePasscode(12)).toHaveLength(12)
  })
})

describe('timingSafeEqual', () => {
  it('同じなら true、違えば false', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
    expect(timingSafeEqual('', '')).toBe(true)
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true)
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false)
    expect(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false)
  })
})

describe('hashPasscode / verifyPasscode', () => {
  it('形式は pbkdf2-sha256$<反復回数>$<ソルト>$<ハッシュ>', async () => {
    const stored = await hashPasscode('AB23CD45')
    const parts = stored.split('$')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('pbkdf2-sha256')
    expect(parts[1]).toBe(String(PBKDF2_ITERATIONS))
    expect(PBKDF2_ITERATIONS).toBe(100_000)
    expect(base64UrlToBytes(parts[2] ?? '')).toHaveLength(16)
    expect(base64UrlToBytes(parts[3] ?? '')).toHaveLength(32)
  })

  it('正しいパスコードだけ通る', async () => {
    const stored = await hashPasscode('AB23CD45')
    expect(await verifyPasscode('AB23CD45', stored)).toBe(true)
    expect(await verifyPasscode('AB23CD46', stored)).toBe(false)
    expect(await verifyPasscode('', stored)).toBe(false)
  })

  it('同じパスコードでもソルトが違うので毎回違う文字列になる', async () => {
    expect(await hashPasscode('AB23CD45')).not.toBe(await hashPasscode('AB23CD45'))
  })

  it('壊れた保存値は false', async () => {
    expect(await verifyPasscode('x', '')).toBe(false)
    expect(await verifyPasscode('x', 'pbkdf2-sha256$100000$abc')).toBe(false)
    expect(await verifyPasscode('x', 'md5$100000$AAAA$AAAA')).toBe(false)
    expect(await verifyPasscode('x', 'pbkdf2-sha256$abc$AAAA$AAAA')).toBe(false)
    expect(await verifyPasscode('x', 'pbkdf2-sha256$0$AAAA$AAAA')).toBe(false)
    expect(await verifyPasscode('x', 'pbkdf2-sha256$100000$!!$AAAA')).toBe(false)
  })
})
