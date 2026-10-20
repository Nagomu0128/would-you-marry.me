import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { error, ME, mockFetch, renderApp, tenant } from '../test-utils'

const { signInWithGoogle, signOut } = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
}))
vi.mock('../lib/auth', () => ({ signInWithGoogle, signOut, authClient: {} }))

beforeEach(() => {
  signInWithGoogle.mockClear()
  signOut.mockClear()
})

describe('ログインの分岐（SA-01）', () => {
  it('401 UNAUTHENTICATED ならログイン画面へ移動する', async () => {
    mockFetch({ 'GET /api/me': () => error(401, 'UNAUTHENTICATED') })
    renderApp('/')
    expect(await screen.findByRole('button', { name: 'Google でログイン' })).toBeInTheDocument()
  })

  it('ログインボタンで Google ログインを呼ぶ', async () => {
    mockFetch({})
    renderApp('/login')
    await userEvent.click(screen.getByRole('button', { name: 'Google でログイン' }))
    expect(signInWithGoogle).toHaveBeenCalledTimes(1)
  })

  it('/login?error=denied では拒否の表示を出す', () => {
    mockFetch({})
    renderApp('/login?error=denied')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'このアカウントでは管理画面を利用できません',
    )
  })

  it('403 FORBIDDEN なら拒否の表示とログアウトを出す', async () => {
    mockFetch({ 'GET /api/me': () => error(403, 'FORBIDDEN') })
    renderApp('/')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'このアカウントでは管理画面を利用できません',
    )
    await userEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
    expect(signOut).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Google でログイン' })).toBeInTheDocument()
  })
})

describe('テナント一覧（SA-02）', () => {
  it('期間のラベルと参加者数・写真枚数を表示し、停止中を優先する', async () => {
    mockFetch({
      'GET /api/me': () => ME,
      'GET /api/tenants': () => ({
        json: {
          tenants: [
            tenant({ id: 'a', name: 'A家' }),
            tenant({ id: 'b', name: 'B家', phase: 'viewing', suspended: true }),
            tenant({ id: 'c', name: 'C家', phase: 'preparation' }),
          ],
        },
      }),
    })
    renderApp('/')
    expect(await screen.findByText('A家')).toBeInTheDocument()
    expect(screen.getByText('参加受付中')).toBeInTheDocument()
    expect(screen.getByText('停止中')).toBeInTheDocument()
    expect(screen.queryByText('閲覧期間')).not.toBeInTheDocument()
    expect(screen.getByText('準備中')).toBeInTheDocument()
    expect(screen.getAllByText('参加者 52 / 写真 830')).toHaveLength(3)
  })

  it('通信エラーでは ErrorState を出して再試行できる', async () => {
    let failing = true
    const { fn } = mockFetch({
      'GET /api/me': () => ME,
      'GET /api/tenants': () =>
        failing ? error(500, 'INTERNAL_ERROR') : { json: { tenants: [] } },
    })
    renderApp('/')
    const retry = await screen.findByRole('button', { name: 'もう一度試す' })
    failing = false
    await userEvent.click(retry)
    await waitFor(() => expect(screen.getByText('テナントはまだありません')).toBeInTheDocument())
    expect(fn).toHaveBeenCalled()
  })
})

describe('テナント作成（SA-03）', () => {
  it('空のまま送ると項目の下にエラーを出し、API は呼ばない', async () => {
    const { calls } = mockFetch({ 'GET /api/me': () => ME })
    renderApp('/tenants/new')
    await userEvent.click(await screen.findByRole('button', { name: '作成する' }))
    expect(screen.getByText('テナント名を 1〜50 文字で入力してください')).toBeInTheDocument()
    expect(screen.getByText('開催日を選んでください')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('51 文字のテナント名は送らない', async () => {
    const { calls } = mockFetch({ 'GET /api/me': () => ME })
    renderApp('/tenants/new')
    await userEvent.type(await screen.findByLabelText('テナント名'), 'あ'.repeat(51))
    await userEvent.type(screen.getByLabelText('開催日'), '2026-10-31')
    await userEvent.click(screen.getByRole('button', { name: '作成する' }))
    expect(screen.getByText('テナント名を 1〜50 文字で入力してください')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('作成すると詳細（SA-04）へ移動する', async () => {
    const { calls } = mockFetch({
      'GET /api/me': () => ME,
      'POST /api/tenants': () => ({ status: 201, json: { tenant: tenant({ id: 'new-id' }) } }),
      'GET /api/tenants/new-id': () => ({
        json: { tenant: tenant({ id: 'new-id', name: '作ったテナント' }), boundaries: {} },
      }),
    })
    renderApp('/tenants/new')
    await userEvent.type(await screen.findByLabelText('テナント名'), '作ったテナント')
    await userEvent.type(screen.getByLabelText('開催日'), '2026-10-31')
    await userEvent.click(screen.getByRole('button', { name: '作成する' }))
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
        name: '作ったテナント',
        eventDate: '2026-10-31',
      }),
    )
    await waitFor(() => expect(calls.some((c) => c.path === '/api/tenants/new-id')).toBe(true))
  })

  it('サーバーの VALIDATION_ERROR を項目の下に出す', async () => {
    mockFetch({
      'GET /api/me': () => ME,
      'POST /api/tenants': () =>
        error(400, 'VALIDATION_ERROR', { fields: { eventDate: 'INVALID' } }),
    })
    renderApp('/tenants/new')
    await userEvent.type(await screen.findByLabelText('テナント名'), 'A家')
    await userEvent.type(screen.getByLabelText('開催日'), '2026-10-31')
    await userEvent.click(screen.getByRole('button', { name: '作成する' }))
    expect(await screen.findByText('開催日を選んでください')).toBeInTheDocument()
  })
})

describe('監視（SA-06）', () => {
  it('全テナントの利用状況の表と、外部の監視ツールへのリンクを出す', async () => {
    mockFetch({
      'GET /api/me': () => ME,
      'GET /api/tenants': () => ({ json: { tenants: [tenant({ name: 'A家' })] } }),
    })
    renderApp('/monitor')
    expect(await screen.findByText('A家')).toBeInTheDocument()
    expect(screen.getByText('2,140')).toBeInTheDocument()
    expect(screen.getByText('3.2GB')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: '外部の監視ツールを開く' })
    expect(link).toHaveAttribute('href', 'https://dash.cloudflare.com/')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
