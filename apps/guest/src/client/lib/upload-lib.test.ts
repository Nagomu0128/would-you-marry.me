import { DISPLAY_MAX_BYTES, ORIGINAL_MAX_BYTES } from '@wym/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFakeXhr, lastXhr } from '../test-xhr'
import { ApiClientError, NetworkError } from './api'
import { checkImageFile, detectImageKind } from './image-file'
import { createResizedImages, encodeWithin, fitWithin, type ImageDeps } from './resize'
import { uploadPhoto } from './upload'

afterEach(() => {
  vi.unstubAllGlobals()
})

const jpegBytes = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]
const pngBytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const heicBytes = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]

describe('選んだ写真の確認', () => {
  it('先頭のバイト列で JPEG / PNG を見分ける', () => {
    expect(detectImageKind(new Uint8Array(jpegBytes))).toBe('jpeg')
    expect(detectImageKind(new Uint8Array(pngBytes))).toBe('png')
    expect(detectImageKind(new Uint8Array(heicBytes))).toBeNull()
  })

  it('HEIC は MIME が image/jpeg でも受け付けない', async () => {
    const file = new File([new Uint8Array(heicBytes)], 'a.jpg', { type: 'image/jpeg' })
    expect(await checkImageFile(file)).toEqual({ ok: false, code: 'UNSUPPORTED_FILE_TYPE' })
  })

  it('10MB ちょうどは通り、超えると FILE_TOO_LARGE', async () => {
    const make = (size: number) => {
      const bytes = new Uint8Array(size)
      bytes.set(jpegBytes)
      return new File([bytes], 'a.jpg', { type: 'image/jpeg' })
    }
    expect(await checkImageFile(make(ORIGINAL_MAX_BYTES))).toEqual({ ok: true, kind: 'jpeg' })
    expect(await checkImageFile(make(ORIGINAL_MAX_BYTES + 1))).toEqual({
      ok: false,
      code: 'FILE_TOO_LARGE',
    })
  })
})

describe('縮小の寸法', () => {
  it('横長・縦長は長辺を合わせ、縦横比を保つ', () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin({ width: 3000, height: 4000 }, 1600)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin({ width: 4000, height: 3000 }, 480)).toEqual({ width: 480, height: 360 })
  })

  it('小さい画像は拡大しない', () => {
    expect(fitWithin({ width: 800, height: 600 }, 1600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin({ width: 1600, height: 900 }, 1600)).toEqual({ width: 1600, height: 900 })
  })
})

describe('上限に収める処理', () => {
  const blobOf = (size: number) => new Blob([new Uint8Array(size)])

  it('収まるなら最高品質のまま', async () => {
    const encode = vi.fn(async () => blobOf(100))
    const result = await encodeWithin({ width: 10, height: 10 }, 200, encode)
    expect(encode).toHaveBeenCalledTimes(1)
    expect(result.blob.size).toBe(100)
  })

  it('収まるまで品質を下げる', async () => {
    const qualities: number[] = []
    const result = await encodeWithin({ width: 10, height: 10 }, 500, async (_size, quality) => {
      qualities.push(quality)
      return blobOf(Math.round(quality * 1000))
    })
    expect(qualities).toEqual([0.85, 0.75, 0.65, 0.55, 0.45])
    expect(result.blob.size).toBe(450)
  })

  it('品質を下げても収まらなければ寸法を縮める', async () => {
    const result = await encodeWithin({ width: 100, height: 50 }, 1000, async (size) =>
      blobOf(size.width * size.height),
    )
    expect(result.width).toBeLessThan(100)
    expect(result.blob.size).toBeLessThanOrEqual(1000)
    expect(result.height).toBe(Math.round(result.width / 2))
  })

  it('縮小画像を作り、拡大表示用の幅・高さを返す', async () => {
    const closed = vi.fn()
    const sizes: { width: number; height: number }[] = []
    const deps: ImageDeps = {
      getSize: async () => ({ width: 3000, height: 4000 }),
      decode: async () => ({ close: closed }),
      toJpeg: async (_source, size) => {
        sizes.push(size)
        return new Blob([new Uint8Array(1000)])
      },
    }
    const result = await createResizedImages(new Blob(), deps)
    expect(result.width).toBe(1200)
    expect(result.height).toBe(1600)
    expect(sizes).toEqual([
      { width: 1200, height: 1600 },
      { width: 360, height: 480 },
    ])
    expect(result.display.size).toBeLessThanOrEqual(DISPLAY_MAX_BYTES)
    expect(closed).toHaveBeenCalledTimes(1)
  })
})

describe('送信（XMLHttpRequest）', () => {
  const parts = {
    original: new Blob(['o']),
    display: new Blob(['d']),
    thumb: new Blob(['t']),
    width: 1200,
    height: 1600,
  }

  it('FormData で送り、進捗を知らせ、成功で写真を返す', async () => {
    installFakeXhr()
    const onProgress = vi.fn()
    const promise = uploadPhoto('t 1', parts, { onProgress })
    const xhr = lastXhr()
    expect(xhr?.method).toBe('POST')
    expect(xhr?.url).toBe('/api/t/t%201/photos')
    const form = xhr?.body as FormData
    expect([...form.keys()]).toEqual(['original', 'display', 'thumb', 'width', 'height'])
    expect(form.get('width')).toBe('1200')

    xhr?.progress(30, 100)
    xhr?.progress(60, 100)
    xhr?.respond(201, { photo: { id: 'p1' } })
    await expect(promise).resolves.toEqual({ photo: { id: 'p1' } })
    expect(onProgress.mock.calls.map(([n]) => n)).toEqual([30, 60, 100])
  })

  it('API のエラーは ApiClientError、通信できないときは NetworkError', async () => {
    installFakeXhr()
    const first = uploadPhoto('t1', parts)
    lastXhr()?.respond(413, { error: { code: 'FILE_TOO_LARGE', message: 'x' } })
    await expect(first).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', status: 413 })
    await expect(first).rejects.toBeInstanceOf(ApiClientError)

    const second = uploadPhoto('t1', parts)
    lastXhr()?.fail()
    await expect(second).rejects.toBeInstanceOf(NetworkError)
  })

  it('中断できる', async () => {
    installFakeXhr()
    const controller = new AbortController()
    const promise = uploadPhoto('t1', parts, { signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })
})
