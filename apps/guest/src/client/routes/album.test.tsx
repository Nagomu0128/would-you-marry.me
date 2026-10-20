import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GuestPhoto } from '@wym/shared'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { resetWelcomeMemory } from '../lib/welcome-storage'
import { apiError, json, meResponse } from '../test-utils'

function photo(id: string, extra: Partial<GuestPhoto> = {}): GuestPhoto {
  return {
    id,
    uploader: { nickname: `user-${id}` },
    likeCount: 2,
    likedByMe: false,
    isMine: false,
    width: 1600,
    height: 1200,
    createdAt: '2026-10-31T00:00:00.000Z',
    urls: {
      thumb: `/api/t/t1/photos/${id}/thumb`,
      display: `/api/t/t1/photos/${id}/display`,
      original: `/api/t/t1/photos/${id}/original`,
    },
    ...extra,
  }
}

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>

/** fetch をモックする。クエリも見られるよう、ハンドラーには URL を渡す */
function mockApi(handlers: Record<string, Handler>) {
  const calls: { key: string; url: URL; init: RequestInit | undefined }[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const key = `${init?.method ?? 'GET'} ${url.pathname}`
    calls.push({ key, url, init })
    if (key === 'GET /api/config') return json({ contactEmail: 'help@example.com' })
    const handler = handlers[key]
    if (!handler) return apiError('NOT_FOUND', 404)
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fn)
  return { calls }
}

function Probe() {
  const location = useLocation()
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>
}

function renderAlbum(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/t/t1/album${search}`]}>
      <Probe />
      <App />
    </MemoryRouter>,
  )
}

const me = (photoCount = 12) => {
  const base = meResponse('たろう')
  return json({ ...base, me: { ...base.me, photoCount, photoLimit: 100 } })
}

const tile = (id: string) => document.querySelector<HTMLElement>(`[data-photo-id="${id}"]`)
const tileIds = () =>
  [...document.querySelectorAll<HTMLElement>('[data-photo-id]')].map((node) => node.dataset.photoId)

beforeEach(() => {
  window.localStorage.clear()
  resetWelcomeMemory()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SG-06 タイムライン', () => {
  it('新しい順（サーバーの順）に一覧を表示し、タブと絞り込みを URL に反映する', async () => {
    const user = userEvent.setup()
    const { calls } = mockApi({
      'GET /api/t/t1/me': () => me(),
      'GET /api/t/t1/photos': (url) =>
        json({
          photos: url.searchParams.get('mine')
            ? [photo('m1', { isMine: true })]
            : [photo('a'), photo('b')],
          nextCursor: null,
        }),
      'GET /api/t/t1/photos/ranking': () => json({ photos: [{ ...photo('r1'), rank: 1 }] }),
    })
    renderAlbum()

    await waitFor(() => expect(tileIds()).toEqual(['a', 'b']))
    expect(screen.getByRole('tab', { name: 'タイムライン' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('button', { name: 'すべて' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '自分の投稿' }))
    await waitFor(() => expect(tileIds()).toEqual(['m1']))
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t1/album?mine=1')
    expect(calls.some((c) => c.url.searchParams.get('mine') === '1')).toBe(true)

    await user.click(screen.getByRole('tab', { name: 'ランキング' }))
    expect(screen.getByTestId('location')).toHaveTextContent('tab=ranking')
    expect(await screen.findByText('1 位')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'タイムライン' }))
    expect(screen.getByTestId('location')).not.toHaveTextContent('tab=')
  })

  it('URL の ?tab=ranking と ?mine=1 で開く。自分の投稿では残り枚数を表示する', async () => {
    mockApi({
      'GET /api/t/t1/me': () => me(12),
      'GET /api/t/t1/photos': () =>
        json({ photos: [photo('m1', { isMine: true })], nextCursor: null }),
    })
    renderAlbum('?mine=1')
    expect(await screen.findByText('あと 88 枚投稿できます')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '自分の投稿' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('末尾が見えたら続きを読み込む。読み込み中に重ねて読み込まない', async () => {
    let reachEnd: () => void = () => {}
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          reachEnd = () =>
            callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never)
        }
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    )
    let release: (response: Response) => void = () => {}
    const { calls } = mockApi({
      'GET /api/t/t1/me': () => me(),
      'GET /api/t/t1/photos': (url) => {
        if (url.searchParams.get('cursor') === 'c1') {
          return new Promise<Response>((resolve) => {
            release = resolve
          })
        }
        return json({ photos: [photo('a'), photo('b')], nextCursor: 'c1' })
      },
    })
    renderAlbum()
    await waitFor(() => expect(tileIds()).toEqual(['a', 'b']))

    reachEnd()
    reachEnd()
    reachEnd()
    const pageCalls = () =>
      calls.filter(
        (c) => c.key === 'GET /api/t/t1/photos' && c.url.searchParams.get('cursor') === 'c1',
      )
    await waitFor(() => expect(pageCalls()).toHaveLength(1))

    release(json({ photos: [photo('b'), photo('c')], nextCursor: null }))
    // 重複した写真は 1 枚だけ表示する
    await waitFor(() => expect(tileIds()).toEqual(['a', 'b', 'c']))
  })

  it('0 件の表示（タイムライン・自分の投稿）と投稿ボタン', async () => {
    const user = userEvent.setup()
    mockApi({
      'GET /api/t/t1/me': () => me(),
      'GET /api/t/t1/photos': () => json({ photos: [], nextCursor: null }),
    })
    renderAlbum()
    expect(
      await screen.findByText('まだ写真がありません。最初の 1 枚を投稿しましょう'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '写真を投稿する' })).toHaveAttribute(
      'href',
      '/t/t1/upload',
    )
    await user.click(screen.getByRole('button', { name: '自分の投稿' }))
    expect(await screen.findByText('まだ投稿していません')).toBeInTheDocument()
  })

  it('通信エラーでは「もう一度試す」を出し、押すと読み込み直す', async () => {
    const user = userEvent.setup()
    let attempts = 0
    mockApi({
      'GET /api/t/t1/me': () => me(),
      'GET /api/t/t1/photos': () => {
        attempts += 1
        if (attempts === 1) throw new TypeError('offline')
        return json({ photos: [photo('a')], nextCursor: null })
      },
    })
    renderAlbum()
    await user.click(await screen.findByRole('button', { name: 'もう一度試す' }))
    await waitFor(() => expect(tileIds()).toEqual(['a']))
  })
})

describe('SG-06 ランキング', () => {
  it('1 位は大きく、2・3 位は並べ、4 位以下は行で、順位と投稿者といいね数を表示する。0 件の表示もある', async () => {
    const ranked = [1, 2, 3, 4, 5].map((rank) => ({
      ...photo(`r${rank}`, { likeCount: 20 - rank }),
      rank,
    }))
    mockApi({
      'GET /api/t/t1/me': () => me(),
      'GET /api/t/t1/photos': () => json({ photos: [], nextCursor: null }),
      'GET /api/t/t1/photos/ranking': () => json({ photos: ranked }),
    })
    renderAlbum('?tab=ranking')
    await screen.findByText('1 位')

    const items = screen.getAllByTestId('ranking-item')
    expect(items).toHaveLength(5)
    expect(items.map((item) => item.querySelector('p')?.textContent)).toEqual([
      '1 位',
      '2 位',
      '3 位',
      expect.anything(),
      expect.anything(),
    ])
    expect(within(items[3] as HTMLElement).getByText('4 位')).toBeInTheDocument()
    expect(within(items[3] as HTMLElement).getByText('user-r4 さん')).toBeInTheDocument()
    expect(within(items[3] as HTMLElement).getByText('16')).toBeInTheDocument()
    // 登場の順番: 3 位 → 2 位 → 1 位
    const delay = (index: number) => Number(items[index]?.getAttribute('data-delay'))
    expect(delay(2)).toBeLessThan(delay(1))
    expect(delay(1)).toBeLessThan(delay(0))
    expect(screen.getByTestId('crown')).toBeInTheDocument()
  })

  it('いいねされた写真がないとき', async () => {
    mockApi({
      'GET /api/t/t1/me': () => me(),
      'GET /api/t/t1/photos': () => json({ photos: [], nextCursor: null }),
      'GET /api/t/t1/photos/ranking': () => json({ photos: [] }),
    })
    renderAlbum('?tab=ranking')
    expect(await screen.findByText('まだいいねされた写真がありません')).toBeInTheDocument()
  })
})

describe('SG-06 拡大表示・いいね・削除', () => {
  it('いいねは楽観的に表示を更新し、サーバーの値で確定する。取り消しもできる', async () => {
    const user = userEvent.setup()
    let release: (response: Response) => void = () => {}
    const { calls } = mockApi({
      'GET /api/t/t1/me': () => me(),
      'GET /api/t/t1/photos': () =>
        json({ photos: [photo('a', { likeCount: 2 })], nextCursor: null }),
      'PUT /api/t/t1/photos/a/like': () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
      'DELETE /api/t/t1/photos/a/like': () => json({ likeCount: 2, likedByMe: false }),
    })
    renderAlbum()
    await waitFor(() => expect(tile('a')).not.toBeNull())
    await user.click(tile('a') as HTMLElement)

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'いいね' }))
    // サーバーの応答の前に、表示が更新されている
    expect(within(dialog).getByRole('button', { name: 'いいねを取り消す' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(dialog).getByText('いいね 3 件')).toBeInTheDocument()
    expect(within(tile('a') as HTMLElement).getByText('3')).toBeInTheDocument()

    release(json({ likeCount: 3, likedByMe: true }))
    await waitFor(() =>
      expect(calls.some((c) => c.key === 'PUT /api/t/t1/photos/a/like')).toBe(true),
    )

    await user.click(within(dialog).getByRole('button', { name: 'いいねを取り消す' }))
    await waitFor(() => expect(within(dialog).getByText('いいね 2 件')).toBeInTheDocument())
    expect(calls.some((c) => c.key === 'DELETE /api/t/t1/photos/a/like')).toBe(true)
  })

  it('いいねに失敗したら表示を戻し、エラーを表示する', async () => {
    const user = userEvent.setup()
    mockApi({
      'GET /api/t/t1/me': () => me(),
      'GET /api/t/t1/photos': () =>
        json({ photos: [photo('a', { likeCount: 2 })], nextCursor: null }),
      'PUT /api/t/t1/photos/a/like': () => apiError('INTERNAL_ERROR', 500),
    })
    renderAlbum()
    await waitFor(() => expect(tile('a')).not.toBeNull())
    await user.click(tile('a') as HTMLElement)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'いいね' }))

    expect(
      await screen.findByText('エラーが発生しました。時間をおいてもう一度お試しください'),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'いいね' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(within(dialog).getByText('いいね 2 件')).toBeInTheDocument()
  })

  it('ランキングからもいいねでき、タイムラインの表示にも反映される', async () => {
    const user = userEvent.setup()
    mockApi({
      'GET /api/t/t1/me': () => me(),
      'GET /api/t/t1/photos': () =>
        json({ photos: [photo('a', { likeCount: 2 })], nextCursor: null }),
      'GET /api/t/t1/photos/ranking': () =>
        json({ photos: [{ ...photo('a', { likeCount: 2 }), rank: 1 }] }),
      'PUT /api/t/t1/photos/a/like': () => json({ likeCount: 3, likedByMe: true }),
    })
    renderAlbum('?tab=ranking')
    await screen.findByText('1 位')
    await user.click(tile('a') as HTMLElement)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'いいね' }))
    await waitFor(() => expect(within(dialog).getByText('いいね 3 件')).toBeInTheDocument())
    await user.click(within(dialog).getByRole('button', { name: '閉じる' }))
    await user.click(screen.getByRole('tab', { name: 'タイムライン' }))
    await waitFor(() => expect(within(tile('a') as HTMLElement).getByText('3')).toBeInTheDocument())
  })

  it('他人の写真には削除がなく、自分の写真は確認シートを経て削除し、一覧から除く', async () => {
    const user = userEvent.setup()
    let deleted = false
    const { calls } = mockApi({
      'GET /api/t/t1/me': () => me(12),
      'GET /api/t/t1/photos': () =>
        json({
          photos: [photo('a'), photo('b', { isMine: true })].filter(
            (p) => !(deleted && p.id === 'b'),
          ),
          nextCursor: null,
        }),
      'DELETE /api/t/t1/photos/b': () => {
        deleted = true
        return new Response(null, { status: 204 })
      },
    })
    renderAlbum('?mine=1')
    await waitFor(() => expect(tileIds()).toEqual(['a', 'b']))
    expect(screen.getByText('あと 88 枚投稿できます')).toBeInTheDocument()

    await user.click(tile('a') as HTMLElement)
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '閉じる' }))

    await user.click(tile('b') as HTMLElement)
    dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '削除' }))
    expect(screen.getByText('この写真を削除しますか？削除すると元に戻せません')).toBeInTheDocument()
    expect(calls.some((c) => c.key === 'DELETE /api/t/t1/photos/b')).toBe(false)

    await user.click(screen.getByRole('button', { name: '削除する' }))
    expect(await screen.findByText('写真を削除しました')).toBeInTheDocument()
    await waitFor(() => expect(tileIds()).toEqual(['a']))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('あと 89 枚投稿できます')).toBeInTheDocument()
  })
})
