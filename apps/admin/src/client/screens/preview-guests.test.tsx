import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BOUNDARIES, error, ME, mockFetch, renderApp, TENANT_ID, tenant } from '../test-utils'

vi.mock('../lib/auth', () => ({
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  authClient: {},
}))

const BASE = `/api/tenants/${TENANT_ID}`

const PHOTO = {
  id: 'p1',
  uploader: { id: 'g1', nickname: 'たろう' },
  likeCount: 3,
  width: 800,
  height: 600,
  createdAt: '2026-10-31T01:00:00.000Z',
  urls: { thumb: '/t/p1', display: '/d/p1', original: '/o/p1' },
}

function previewRoutes() {
  return {
    'GET /api/me': () => ME,
    [`GET ${BASE}`]: () => ({ json: { tenant: tenant(), boundaries: BOUNDARIES } }),
    [`GET ${BASE}/photos?limit=3`]: () => ({ json: { photos: [PHOTO], nextCursor: null } }),
    [`GET ${BASE}/seating-chart`]: () => error(404, 'NOT_FOUND'),
    [`GET ${BASE}/course-menu`]: () => ({ json: { images: [{ id: 'i1', url: '/img/1' }] } }),
  }
}

describe('参加者画面のプレビュー（SA-08）', () => {
  it('ホームにテナント名・開催日・ニックネーム「プレビュー」・新着写真を出す', async () => {
    mockFetch(previewRoutes())
    renderApp(`/tenants/${TENANT_ID}/preview`)
    const frame = await screen.findByTestId('preview-frame')
    expect(await within(frame).findByText('山田家・佐藤家 結婚式')).toBeInTheDocument()
    expect(within(frame).getByText('2026.10.31')).toBeInTheDocument()
    expect(within(frame).getByText('こんにちは、プレビュー さん')).toBeInTheDocument()
    expect(within(frame).getByAltText('たろう さんの写真')).toHaveAttribute('src', '/t/p1')
    expect(frame).toHaveClass('w-[375px]')
  })

  it('タブで席次表（未登録）と料理に切り替わる', async () => {
    mockFetch(previewRoutes())
    renderApp(`/tenants/${TENANT_ID}/preview`)
    const frame = await screen.findByTestId('preview-frame')
    await within(frame).findByText('2026.10.31')

    await userEvent.click(screen.getByRole('tab', { name: '席次表' }))
    expect(await within(frame).findByText('席次表は準備中です')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: '料理' }))
    expect(await within(frame).findByText('料理のコース')).toBeInTheDocument()
    expect(await within(frame).findByRole('img')).toHaveAttribute('src', '/img/1')

    await userEvent.click(screen.getByRole('tab', { name: 'ホーム' }))
    expect(await within(frame).findByText('2026.10.31')).toBeInTheDocument()
  })

  it('コース表が未登録なら参加者と同じ「準備中」を出す', async () => {
    mockFetch({ ...previewRoutes(), [`GET ${BASE}/course-menu`]: () => ({ json: { images: [] } }) })
    renderApp(`/tenants/${TENANT_ID}/preview`)
    await userEvent.click(await screen.findByRole('tab', { name: '料理' }))
    expect(await screen.findByText('コースのご案内は準備中です')).toBeInTheDocument()
  })

  it('リンクが押せず、GET 以外を呼ばない', async () => {
    const { calls } = mockFetch(previewRoutes())
    renderApp(`/tenants/${TENANT_ID}/preview`)
    const frame = await screen.findByTestId('preview-frame')
    await within(frame).findByText('2026.10.31')
    expect(within(frame).queryAllByRole('link')).toHaveLength(0)

    await userEvent.click(within(frame).getByText('席次表'))
    await userEvent.click(within(frame).getByText('変更'))
    // 画面は移動しない
    expect(screen.getByTestId('preview-frame')).toBeInTheDocument()
    expect(within(frame).getByText('2026.10.31')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: '席次表' }))
    await within(frame).findByText('席次表は準備中です')
    await userEvent.click(screen.getByRole('tab', { name: '料理' }))
    await within(frame).findByText('料理のコース')
    expect(calls.every((c) => c.method === 'GET')).toBe(true)
  })

  it('通信エラーなら「もう一度試す」で読み直せる', async () => {
    let fail = true
    mockFetch({
      ...previewRoutes(),
      [`GET ${BASE}/photos?limit=3`]: () =>
        fail ? error(500, 'INTERNAL_ERROR') : { json: { photos: [], nextCursor: null } },
    })
    renderApp(`/tenants/${TENANT_ID}/preview`)
    const retry = await screen.findByRole('button', { name: 'もう一度試す' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByText('2026.10.31')).toBeInTheDocument()
  })
})

const GUESTS = [
  { id: 'g1', nickname: 'たろう', photoCount: 12, createdAt: '2026-10-31T01:00:00.000Z' },
  { id: 'g2', nickname: 'はなこ', photoCount: 3, createdAt: '2026-10-31T02:00:00.000Z' },
]

function guestRoutes(patch?: () => { status?: number; json?: unknown }) {
  return {
    'GET /api/me': () => ME,
    [`GET ${BASE}/guests`]: () => ({ json: { guests: GUESTS } }),
    ...(patch ? { [`PATCH ${BASE}/guests/g1`]: patch } : {}),
  }
}

async function openDialog() {
  renderApp(`/tenants/${TENANT_ID}/guests`)
  await screen.findByText('たろう')
  await userEvent.click(screen.getAllByRole('button', { name: '変更' })[0] as HTMLElement)
  return await screen.findByRole('dialog')
}

describe('参加者管理（SA-09）', () => {
  it('ニックネームと投稿枚数の一覧を出す', async () => {
    mockFetch(guestRoutes())
    renderApp(`/tenants/${TENANT_ID}/guests`)
    expect(await screen.findByText('たろう')).toBeInTheDocument()
    expect(screen.getByText('12 枚')).toBeInTheDocument()
    expect(screen.getByText('はなこ')).toBeInTheDocument()
    expect(screen.getByText('3 枚')).toBeInTheDocument()
  })

  it('0 件のときは空の表示を出す', async () => {
    mockFetch({ 'GET /api/me': () => ME, [`GET ${BASE}/guests`]: () => ({ json: { guests: [] } }) })
    renderApp(`/tenants/${TENANT_ID}/guests`)
    expect(await screen.findByText('参加者はまだいません')).toBeInTheDocument()
  })

  it('変更に成功すると、トーストを出して一覧を読み直す', async () => {
    let renamed = false
    const { calls } = mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/guests`]: () => ({
        json: {
          guests: renamed ? [{ ...GUESTS[0], nickname: 'たろう2' }, GUESTS[1]] : GUESTS,
        },
      }),
      [`PATCH ${BASE}/guests/g1`]: () => {
        renamed = true
        return { json: {} }
      },
    })
    const dialog = await openDialog()
    const input = within(dialog).getByLabelText('ニックネーム')
    await userEvent.clear(input)
    await userEvent.type(input, ' たろう2 ')
    await userEvent.click(within(dialog).getByRole('button', { name: '変更する' }))
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ nickname: 'たろう2' }),
    )
    expect(await screen.findByText('保存しました')).toBeInTheDocument()
    expect(await screen.findByText('たろう2')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('使用中の名前なら「この名前は使われています」を出し、ダイアログを閉じない', async () => {
    mockFetch(guestRoutes(() => error(409, 'NICKNAME_TAKEN')))
    const dialog = await openDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: '変更する' }))
    expect(
      await within(dialog).findByText('この名前は使われています。別の名前を入力してください'),
    ).toBeInTheDocument()
  })

  it('空なら API を呼ばずに入力エラーを出す', async () => {
    const { calls } = mockFetch(guestRoutes(() => ({ json: {} })))
    const dialog = await openDialog()
    await userEvent.clear(within(dialog).getByLabelText('ニックネーム'))
    await userEvent.click(within(dialog).getByRole('button', { name: '変更する' }))
    expect(await within(dialog).findByText('ニックネームを入力してください')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('20 文字は通り、21 文字は API を呼ばずに入力エラーを出す', async () => {
    const { calls } = mockFetch(guestRoutes(() => ({ json: {} })))
    const dialog = await openDialog()
    const input = within(dialog).getByLabelText('ニックネーム')
    await userEvent.clear(input)
    await userEvent.type(input, 'あ'.repeat(21))
    expect(
      within(dialog).getByText('ニックネームは 20 文字以内で入力してください'),
    ).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '変更する' }))
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)

    await userEvent.type(input, '{Backspace}')
    expect(
      within(dialog).queryByText('ニックネームは 20 文字以内で入力してください'),
    ).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '変更する' }))
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ nickname: 'あ'.repeat(20) }),
    )
  })
})
