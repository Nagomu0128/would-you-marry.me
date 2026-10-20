import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadUrl, isInAppBrowser, savePhoto } from './save-photo'

const input = { photoId: 'p1', originalUrl: '/api/t/t1/photos/p1/original' }

function domError(name: string) {
  const error = new Error(name)
  error.name = name
  return error
}

function stubNavigator(options: {
  share?: ReturnType<typeof vi.fn> | undefined
  canShare?: ((data: ShareData) => boolean) | undefined
  userAgent?: string
}) {
  vi.stubGlobal('navigator', {
    share: options.share,
    canShare: options.canShare,
    userAgent: options.userAgent ?? 'Mozilla/5.0 (iPhone) Safari',
  })
}

function stubFetch(ok = true) {
  const fn = vi.fn(async () =>
    ok
      ? new Response(new Blob(['x'], { type: 'image/jpeg' }), { status: 200 })
      : new Response('', { status: 500 }),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

let clicked: HTMLAnchorElement[]

beforeEach(() => {
  clicked = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('savePhoto', () => {
  it('Web Share が使えるとき、オリジナルを取得して共有メニューを開く', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ share, canShare: () => true })
    const fetchFn = stubFetch()

    const result = await savePhoto(input)

    expect(result).toEqual({ status: 'shared' })
    expect(fetchFn).toHaveBeenCalledWith(input.originalUrl, { credentials: 'same-origin' })
    const data = share.mock.calls[0]?.[0] as { files: File[] }
    expect(data.files).toHaveLength(1)
    expect(data.files[0]?.name).toBe('wedding-photo-p1.jpg')
    expect(clicked).toHaveLength(0)
  })

  it('PNG のオリジナルは拡張子 png のファイルにする', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ share, canShare: () => true })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['x'], { type: 'image/png' }))),
    )
    await savePhoto(input)
    const data = share.mock.calls[0]?.[0] as { files: File[] }
    expect(data.files[0]?.name).toBe('wedding-photo-p1.png')
  })

  it('Web Share が使えないとき、?download=1 のURLでダウンロードする（取得はしない）', async () => {
    stubNavigator({})
    const fetchFn = stubFetch()

    const result = await savePhoto(input)

    expect(result).toEqual({ status: 'downloaded' })
    expect(fetchFn).not.toHaveBeenCalled()
    expect(clicked).toHaveLength(1)
    expect(clicked[0]?.getAttribute('href')).toBe(`${input.originalUrl}?download=1`)
  })

  it('canShare が files を受け付けないときもダウンロードする', async () => {
    stubNavigator({ share: vi.fn(), canShare: () => false })
    stubFetch()
    expect(await savePhoto(input)).toEqual({ status: 'downloaded' })
  })

  it('アプリ内ブラウザで共有もできないときは、案内を出す状態を返しダウンロードしない', async () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (iPhone) Line/13.0.0' })
    stubFetch()
    expect(await savePhoto(input)).toEqual({ status: 'unsupported' })
    expect(clicked).toHaveLength(0)
  })

  it('NotAllowedError のときは取得済みのファイルを返し、2 回目は取得せずに共有する', async () => {
    const share = vi
      .fn()
      .mockRejectedValueOnce(domError('NotAllowedError'))
      .mockResolvedValueOnce(undefined)
    stubNavigator({ share, canShare: () => true })
    const fetchFn = stubFetch()

    const first = await savePhoto(input)
    expect(first.status).toBe('needs-tap')
    if (first.status !== 'needs-tap') return

    const second = await savePhoto({ ...input, file: first.file })
    expect(second).toEqual({ status: 'shared' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(share).toHaveBeenCalledTimes(2)
    const secondData = share.mock.calls[1]?.[0] as { files: File[] }
    expect(secondData.files[0]).toBe(first.file)
  })

  it('2 回目も NotAllowedError なら、また取得済みのファイルを返す（保存できないまま終わらない）', async () => {
    const share = vi.fn().mockRejectedValue(domError('NotAllowedError'))
    stubNavigator({ share, canShare: () => true })
    stubFetch()
    const first = await savePhoto(input)
    if (first.status !== 'needs-tap') throw new Error('needs-tap のはず')
    const second = await savePhoto({ ...input, file: first.file })
    expect(second).toEqual({ status: 'needs-tap', file: first.file })
  })

  it('共有メニューを閉じた（AbortError）のはエラーにしない', async () => {
    const share = vi.fn().mockRejectedValue(domError('AbortError'))
    stubNavigator({ share, canShare: () => true })
    stubFetch()
    expect(await savePhoto(input)).toEqual({ status: 'cancelled' })
    expect(clicked).toHaveLength(0)
  })

  it('それ以外の共有の失敗はダウンロードに切り替える', async () => {
    const share = vi.fn().mockRejectedValue(domError('DataError'))
    stubNavigator({ share, canShare: () => true })
    stubFetch()
    expect(await savePhoto(input)).toEqual({ status: 'downloaded' })
  })

  it('取得に失敗したら failed', async () => {
    stubNavigator({ share: vi.fn(), canShare: () => true })
    stubFetch(false)
    expect(await savePhoto(input)).toEqual({ status: 'failed' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline')
      }),
    )
    expect(await savePhoto(input)).toEqual({ status: 'failed' })
  })
})

describe('isInAppBrowser / downloadUrl', () => {
  it('主なアプリ内ブラウザを判定する', () => {
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) Line/13.0.0')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) Instagram 300.0')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android) [FBAN/FB4A;FBAV/400]')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) Safari/604.1')).toBe(false)
  })

  it('既にクエリがあれば & でつなぐ', () => {
    expect(downloadUrl('/a')).toBe('/a?download=1')
    expect(downloadUrl('/a?x=1')).toBe('/a?x=1&download=1')
  })
})
