import { isUploadKey } from '@wym/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUploadKey } from './upload-key'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('投稿キー', () => {
  it('randomUUID があるとき、条件を満たし毎回違う', () => {
    const a = createUploadKey()
    const b = createUploadKey()
    expect(isUploadKey(a)).toBe(true)
    expect(a).not.toBe(b)
  })

  it('randomUUID がなくても、UUID v4 の形で条件を満たし毎回違う', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => {
        for (let i = 0; i < array.length; i += 1) array[i] = Math.floor(Math.random() * 256)
        return array
      },
    })
    const a = createUploadKey()
    const b = createUploadKey()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(isUploadKey(a)).toBe(true)
    expect(a).not.toBe(b)
  })
})
