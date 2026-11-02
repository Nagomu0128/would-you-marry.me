import { describe, expect, it } from 'vitest'
import { isUploadKey, UPLOAD_KEY_HEADER } from './upload-key'

describe('投稿キー（D-41）', () => {
  it('ヘッダー名', () => {
    expect(UPLOAD_KEY_HEADER).toBe('Idempotency-Key')
  })

  it('crypto.randomUUID() の値を受け付ける', () => {
    expect(isUploadKey(crypto.randomUUID())).toBe(true)
    expect(isUploadKey('3f2b8c1e-9d4a-4f6b-8e2a-1c5d7e9f0a3b')).toBe(true)
  })

  it('英数字とハイフンで 16〜64 文字だけを受け付ける', () => {
    expect(isUploadKey('a'.repeat(16))).toBe(true)
    expect(isUploadKey('a'.repeat(64))).toBe(true)
    expect(isUploadKey('a'.repeat(15))).toBe(false)
    expect(isUploadKey('a'.repeat(65))).toBe(false)
    expect(isUploadKey('')).toBe(false)
    expect(isUploadKey('abcdefghijklmnop qrst')).toBe(false)
    expect(isUploadKey('abcdefghijklmnop/qrst')).toBe(false)
    expect(isUploadKey('ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐ')).toBe(false)
  })
})
