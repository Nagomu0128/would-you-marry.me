import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { StaffPhoto } from '@wym/shared'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { resetWelcomeMemory } from '../lib/welcome-storage'
import { apiError, json } from '../test-utils'

function photo(id: string, extra: Partial<StaffPhoto> = {}): StaffPhoto {
  return {
    id,
    uploader: { id: `u-${id}`, nickname: `user-${id}` },
    likeCount: 2,
    width: 1600,
    height: 1200,
    createdAt: '2026-10-31T00:00:00.000Z',
    urls: {
      thumb: `/api/couple/t1/photos/${id}/thumb`,
      display: `/api/couple/t1/photos/${id}/display`,
      original: `/api/couple/t1/photos/${id}/original`,
    },
    ...extra,
  }
}

type Handler = (url: URL) => Response | Promise<Response>

function mockApi(handlers: Record<string, Handler>) {
  const calls: { key: string; url: URL }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      const key = `${init?.method ?? 'GET'} ${url.pathname}`
      calls.push({ key, url })
      if (key === 'GET /api/config') return json({ contactEmail: 'help@example.com' })
      const handler = handlers[key]
      return handler ? handler(url) : apiError('NOT_FOUND', 404)
    }),
  )
  return { calls }
}

function Probe() {
  const location = useLocation()
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>
}

function renderPhotos(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/couple/t1/photos${search}`]}>
      <Probe />
      <App />
    </MemoryRouter>,
  )
}

const meHandler = () =>
  json({
    tenant: { id: 't1', name: '〇〇家・△△家 結婚式', eventDate: '2026-10-31', phase: 'viewing' },
  })

const uploadersHandler = () =>
  json({
    uploaders: [
      { id: 'u-a', nickname: 'はなこ', photoCount: 3 },
      { id: 'u-b', nickname: 'たろう', photoCount: 12 },
    ],
  })

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

describe('SC-02 写真一覧', () => {
  it('見出しに結婚式の名前を出し、サーバーの順に一覧を表示する。タブを URL に反映する', async () => {
    const user = userEvent.setup()
    mockApi({
      'GET /api/couple/t1/me': meHandler,
      'GET /api/couple/t1/uploaders': uploadersHandler,
      'GET /api/couple/t1/photos': () =>
        json({ photos: [photo('a'), photo('b')], nextCursor: null }),
      'GET /api/couple/t1/photos/ranking': () => json({ photos: [{ ...photo('r1'), rank: 1 }] }),
    })
    renderPhotos()
    expect(await screen.findByText('〇〇家・△△家 結婚式')).toBeInTheDocument()
    await waitFor(() => expect(tileIds()).toEqual(['a', 'b']))
    expect(screen.getByRole('tab', { name: 'すべての写真' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('link', { name: '利用規約' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'ランキング' }))
    expect(screen.getByTestId('location')).toHaveTextContent('tab=ranking')
    expect(await screen.findByText('1 位')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'すべての写真' }))
    expect(screen.getByTestId('location')).not.toHaveTextContent('tab=')
    await waitFor(() => expect(tileIds()).toEqual(['a', 'b']))
  })

  it('投稿者の一覧から選ぶとその人の写真だけを表示し、「すべて」で解除する', async () => {
    const user = userEvent.setup()
    const { calls } = mockApi({
      'GET /api/couple/t1/me': meHandler,
      'GET /api/couple/t1/uploaders': uploadersHandler,
      'GET /api/couple/t1/photos': (url) =>
        json({
          photos:
            url.searchParams.get('uploaderId') === 'u-b' ? [photo('t1')] : [photo('a'), photo('b')],
          nextCursor: null,
        }),
    })
    renderPhotos()
    await waitFor(() => expect(tileIds()).toEqual(['a', 'b']))

    await user.click(screen.getByRole('button', { name: /投稿者: すべて/ }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText('はなこ')).toBeInTheDocument()
    expect(within(sheet).getByText('3 枚')).toBeInTheDocument()
    expect(within(sheet).getByText('12 枚')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: /たろう/ }))

    await waitFor(() => expect(tileIds()).toEqual(['t1']))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('uploader=u-b')
    expect(calls.some((c) => c.url.searchParams.get('uploaderId') === 'u-b')).toBe(true)

    await user.click(screen.getByRole('button', { name: /投稿者: たろう/ }))
    const again = await screen.findByRole('dialog')
    await user.click(within(again).getByRole('button', { name: 'すべて' }))
    await waitFor(() => expect(tileIds()).toEqual(['a', 'b']))
    expect(screen.getByTestId('location')).not.toHaveTextContent('uploader=')
  })

  it('末尾が見えたら続きを読み込み、重複した写真は 1 枚だけ表示する', async () => {
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
    const { calls } = mockApi({
      'GET /api/couple/t1/me': meHandler,
      'GET /api/couple/t1/uploaders': uploadersHandler,
      'GET /api/couple/t1/photos': (url) =>
        url.searchParams.get('cursor') === 'c1'
          ? json({ photos: [photo('b'), photo('c')], nextCursor: null })
          : json({ photos: [photo('a'), photo('b')], nextCursor: 'c1' }),
    })
    renderPhotos()
    await waitFor(() => expect(tileIds()).toEqual(['a', 'b']))
    reachEnd()
    await waitFor(() => expect(tileIds()).toEqual(['a', 'b', 'c']))
    expect(calls.filter((c) => c.url.searchParams.get('cursor') === 'c1')).toHaveLength(1)
  })

  it('拡大表示にはいいね・削除がなく、保存といいね数がある', async () => {
    const user = userEvent.setup()
    mockApi({
      'GET /api/couple/t1/me': meHandler,
      'GET /api/couple/t1/uploaders': uploadersHandler,
      'GET /api/couple/t1/photos': () =>
        json({ photos: [photo('a', { likeCount: 5 })], nextCursor: null }),
    })
    renderPhotos()
    await waitFor(() => expect(tileIds()).toEqual(['a']))
    await user.click(document.querySelector<HTMLElement>('[data-photo-id="a"]') as HTMLElement)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: '保存' })).toBeInTheDocument()
    expect(within(dialog).getByText('いいね 5 件')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'いいね' })).not.toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'いいねを取り消す' }),
    ).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
  })

  it('0 件のときは「まだ写真がありません」を表示する', async () => {
    mockApi({
      'GET /api/couple/t1/me': meHandler,
      'GET /api/couple/t1/uploaders': () => json({ uploaders: [] }),
      'GET /api/couple/t1/photos': () => json({ photos: [], nextCursor: null }),
    })
    renderPhotos()
    expect(await screen.findByText('まだ写真がありません')).toBeInTheDocument()
  })

  it('通信エラーでは「もう一度試す」を出し、押すと読み込み直す', async () => {
    const user = userEvent.setup()
    let attempts = 0
    mockApi({
      'GET /api/couple/t1/me': meHandler,
      'GET /api/couple/t1/uploaders': uploadersHandler,
      'GET /api/couple/t1/photos': () => {
        attempts += 1
        if (attempts === 1) throw new TypeError('offline')
        return json({ photos: [photo('a')], nextCursor: null })
      },
    })
    renderPhotos()
    await user.click(await screen.findByRole('button', { name: 'もう一度試す' }))
    await waitFor(() => expect(tileIds()).toEqual(['a']))
  })

  it('セッションがないとき（UNAUTHENTICATED）は新郎新婦向けのエラー画面へ移動する', async () => {
    mockApi({
      'GET /api/couple/t1/me': () => apiError('UNAUTHENTICATED', 401),
      'GET /api/couple/t1/uploaders': () => apiError('UNAUTHENTICATED', 401),
      'GET /api/couple/t1/photos': () => apiError('UNAUTHENTICATED', 401),
    })
    renderPhotos()
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/error?code=UNAUTHENTICATED&audience=couple',
      ),
    )
    expect(
      await screen.findByText('管理者からお知らせした URL を開いてください', { exact: false }),
    ).toBeInTheDocument()
  })
})
