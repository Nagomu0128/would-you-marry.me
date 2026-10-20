import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { error, ME, mockFetch, renderApp, TENANT_ID } from '../test-utils'

vi.mock('../lib/auth', () => ({
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  authClient: {},
}))

const BASE = `/api/tenants/${TENANT_ID}`
const PATH = `/tenants/${TENANT_ID}/photos`

function photo(id: string, nickname: string, likeCount = 0) {
  return {
    id,
    uploader: { id: `g-${id}`, nickname },
    likeCount,
    width: 800,
    height: 600,
    createdAt: '2026-10-31T01:00:00.000Z',
    urls: { thumb: `/t/${id}`, display: `/d/${id}`, original: `/o/${id}` },
  }
}

const P1 = photo('p1', 'たろう', 12)
const P2 = photo('p2', 'はなこ', 3)

afterEach(() => vi.unstubAllGlobals())

async function openViewer(name: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByAltText(name))
  return user
}

describe('写真管理（SA-07）', () => {
  it('写真を新しい順のグリッドで出し、いいね数も読める', async () => {
    mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/photos?limit=60`]: () => ({ json: { photos: [P1, P2], nextCursor: null } }),
    })
    renderApp(PATH)
    await screen.findByAltText('たろう さんの写真')
    const alts = screen.getAllByRole('img').map((i) => i.getAttribute('alt'))
    expect(alts).toEqual(['たろう さんの写真', 'はなこ さんの写真'])
    expect(screen.getByText('いいね 12 件')).toBeInTheDocument()
  })

  it('末尾が見えたらカーソルで続きを読み込む', async () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private cb: (e: { isIntersecting: boolean }[]) => void) {}
        observe() {
          this.cb([{ isIntersecting: true }])
        }
        disconnect() {}
      },
    )
    const { calls } = mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/photos?limit=60`]: () => ({ json: { photos: [P1], nextCursor: 'c1' } }),
      [`GET ${BASE}/photos?limit=60&cursor=c1`]: () => ({
        json: { photos: [P2], nextCursor: null },
      }),
    })
    renderApp(PATH)
    expect(await screen.findByAltText('はなこ さんの写真')).toBeInTheDocument()
    expect(screen.getByAltText('たろう さんの写真')).toBeInTheDocument()
    expect(calls.filter((c) => c.path.includes('cursor=c1'))).toHaveLength(1)
  })

  it('拡大表示に投稿者・いいね数・保存・削除があり、いいねのボタンはない', async () => {
    mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/photos?limit=60`]: () => ({ json: { photos: [P1], nextCursor: null } }),
    })
    renderApp(PATH)
    await openViewer('たろう さんの写真')
    expect(await screen.findByText('たろう さん')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'いいね' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'いいねを取り消す' })).toBeNull()
  })

  it('削除の確認でキャンセルすると削除しない', async () => {
    const { calls } = mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/photos?limit=60`]: () => ({ json: { photos: [P1], nextCursor: null } }),
    })
    renderApp(PATH)
    const user = await openViewer('たろう さんの写真')
    await user.click(await screen.findByRole('button', { name: '削除' }))
    expect(
      await screen.findByText(
        'この写真を削除しますか？参加者・新郎新婦の画面からも消え、元に戻せません',
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('削除に成功すると一覧から消え、トーストを出す', async () => {
    const { calls } = mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/photos?limit=60`]: () => ({ json: { photos: [P1, P2], nextCursor: null } }),
      [`DELETE ${BASE}/photos/p1`]: () => ({ status: 204 }),
    })
    renderApp(PATH)
    const user = await openViewer('たろう さんの写真')
    await user.click(await screen.findByRole('button', { name: '削除' }))
    await user.click(await screen.findByRole('button', { name: '削除する' }))
    expect(await screen.findByText('写真を削除しました')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByAltText('たろう さんの写真')).toBeNull())
    expect(screen.getByAltText('はなこ さんの写真')).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1)
  })

  it('削除に失敗すると写真を残し、エラーのトーストを出す', async () => {
    mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/photos?limit=60`]: () => ({ json: { photos: [P1], nextCursor: null } }),
      [`DELETE ${BASE}/photos/p1`]: () => error(500, 'INTERNAL_ERROR'),
    })
    renderApp(PATH)
    const user = await openViewer('たろう さんの写真')
    await user.click(await screen.findByRole('button', { name: '削除' }))
    await user.click(await screen.findByRole('button', { name: '削除する' }))
    expect(
      await screen.findByText('エラーが発生しました。時間をおいてもう一度お試しください'),
    ).toBeInTheDocument()
    expect(screen.queryByText('写真を削除しました')).toBeNull()
    expect(screen.getAllByAltText('たろう さんの写真').length).toBeGreaterThan(0)
  })

  it('0 件のときは空の表示を出す', async () => {
    mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/photos?limit=60`]: () => ({ json: { photos: [], nextCursor: null } }),
    })
    renderApp(PATH)
    expect(await screen.findByText('まだ写真がありません')).toBeInTheDocument()
  })

  it('通信エラーのときは「もう一度試す」で読み直せる', async () => {
    let n = 0
    mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/photos?limit=60`]: () => {
        n += 1
        return n === 1 ? error(500, 'INTERNAL_ERROR') : { json: { photos: [P1], nextCursor: null } }
      },
    })
    renderApp(PATH)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'もう一度試す' }))
    expect(await screen.findByAltText('たろう さんの写真')).toBeInTheDocument()
  })
})
