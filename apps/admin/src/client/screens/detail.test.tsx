import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { monitoringUrl } from '../lib/config'
import { BOUNDARIES, error, ME, mockFetch, renderApp, TENANT_ID, tenant } from '../test-utils'

vi.mock('../lib/auth', () => ({
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  authClient: {},
}))

const DETAIL = `/api/tenants/${TENANT_ID}`

function detailRoutes(t = tenant()) {
  return {
    'GET /api/me': () => ME,
    [`GET ${DETAIL}`]: () => ({ json: { tenant: t, boundaries: BOUNDARIES } }),
    [`GET ${DETAIL}/seating-chart`]: () => error(404, 'NOT_FOUND'),
    [`GET ${DETAIL}/course-menu`]: () => ({
      json: {
        images: [
          { id: 'i1', url: '/img/1' },
          { id: 'i2', url: '/img/2' },
          { id: 'i3', url: '/img/3' },
        ],
      },
    }),
  }
}

describe('テナント詳細（SA-04）', () => {
  it('期間と終わりの日、削除予定日、利用状況を表示する', async () => {
    mockFetch(detailRoutes())
    renderApp(`/tenants/${TENANT_ID}`)
    expect(await screen.findByText('期間: 参加受付中（11/1 まで）')).toBeInTheDocument()
    expect(screen.getByText('データの削除予定日: 2027-05-01')).toBeInTheDocument()
    expect(screen.getByText('参加者 52 / 写真 830 / いいね 2,140 / 3.2GB')).toBeInTheDocument()
    expect(await screen.findByText('3 枚')).toBeInTheDocument()
  })

  it('停止は確認ダイアログを出し、確定すると suspended: true を送る', async () => {
    const { calls } = mockFetch({
      ...detailRoutes(),
      [`PATCH ${DETAIL}`]: () => ({ json: { tenant: tenant({ suspended: true }) } }),
    })
    renderApp(`/tenants/${TENANT_ID}`)
    await userEvent.click(await screen.findByRole('button', { name: '停止する' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(
      '「山田家・佐藤家 結婚式」を停止しますか？参加者と新郎新婦は利用できなくなります',
    )
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
    await userEvent.click(within(dialog).getByRole('button', { name: '停止する' }))
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ suspended: true }),
    )
    expect(await screen.findByRole('button', { name: '再開する' })).toBeInTheDocument()
  })

  it('キャンセルすると停止しない', async () => {
    const { calls } = mockFetch(detailRoutes())
    renderApp(`/tenants/${TENANT_ID}`)
    await userEvent.click(await screen.findByRole('button', { name: '停止する' }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'キャンセル' }),
    )
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('削除はテナント名の入力を求め、不一致ならエラーを出す', async () => {
    const { calls } = mockFetch({
      ...detailRoutes(),
      [`POST ${DETAIL}/deletion`]: () => error(400, 'CONFIRMATION_MISMATCH'),
    })
    renderApp(`/tenants/${TENANT_ID}`)
    await userEvent.click(await screen.findByRole('button', { name: 'このテナントを削除する' }))
    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: '削除する' })
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('テナント名'), 'ちがう名前')
    await userEvent.click(confirm)
    expect(await within(dialog).findByText('テナント名が一致しません')).toBeInTheDocument()
    expect(calls.find((c) => c.path.endsWith('/deletion'))?.body).toEqual({
      confirmName: 'ちがう名前',
    })
  })

  it('削除に成功すると一覧へ戻る', async () => {
    mockFetch({
      ...detailRoutes(),
      [`POST ${DETAIL}/deletion`]: () => ({ status: 204 }),
      'GET /api/tenants': () => ({ json: { tenants: [] } }),
    })
    renderApp(`/tenants/${TENANT_ID}`)
    await userEvent.click(await screen.findByRole('button', { name: 'このテナントを削除する' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('テナント名'), '山田家・佐藤家 結婚式')
    await userEvent.click(within(dialog).getByRole('button', { name: '削除する' }))
    expect(await screen.findByText('テナントはまだありません')).toBeInTheDocument()
  })

  it('基本情報を編集して保存する', async () => {
    const { calls } = mockFetch({
      ...detailRoutes(),
      [`PATCH ${DETAIL}`]: () => ({ json: { tenant: tenant() } }),
    })
    renderApp(`/tenants/${TENANT_ID}`)
    await screen.findByText('基本情報')
    await userEvent.click(screen.getAllByRole('button', { name: '編集' })[0] as HTMLElement)
    const name = screen.getByLabelText('テナント名')
    await userEvent.clear(name)
    await userEvent.type(name, '新しい名前')
    await userEvent.click(screen.getByRole('button', { name: '保存する' }))
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
        name: '新しい名前',
        eventDate: '2026-10-31',
      }),
    )
    expect(await screen.findByText('保存しました')).toBeInTheDocument()
  })

  it('席次表は PDF 以外・20MB 超を送らず、PDF は本文そのものを PUT する', async () => {
    const { calls } = mockFetch({
      ...detailRoutes(),
      [`PUT ${DETAIL}/seating-chart`]: () => ({
        json: { sizeBytes: 3, uploadedAt: '2026-10-01T00:00:00.000Z' },
      }),
    })
    renderApp(`/tenants/${TENANT_ID}`)
    const input = (await screen.findByTestId('seating-file')) as HTMLInputElement

    const png = new File(['x'], 'a.png', { type: 'image/png' })
    await userEvent.upload(input, png, { applyAccept: false })
    expect(await screen.findByText('PDF ファイルを選んでください')).toBeInTheDocument()

    const big = new File(['x'], 'big.pdf', { type: 'application/pdf' })
    Object.defineProperty(big, 'size', { value: 20 * 1024 * 1024 + 1 })
    await userEvent.upload(input, big)
    expect(await screen.findByText('PDF のサイズが大きすぎます（20MB まで）')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)

    const pdf = new File(['%PDF'], 'seat.pdf', { type: 'application/pdf' })
    await userEvent.upload(input, pdf)
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
    expect(await screen.findByRole('link', { name: '確認' })).toHaveAttribute('target', '_blank')
  })

  it('コース表の並べ替えは、すべての画像 ID を表示順に PUT する', async () => {
    const { calls } = mockFetch({
      ...detailRoutes(),
      [`PUT ${DETAIL}/course-menu/order`]: () => ({ status: 204 }),
    })
    renderApp(`/tenants/${TENANT_ID}`)
    await screen.findByText('3 枚')
    await userEvent.click(screen.getAllByRole('button', { name: '編集' })[1] as HTMLElement)
    // 3 枚目を 1 つ上へ → i1, i3, i2
    await userEvent.click(await screen.findByRole('button', { name: '上へ 3' }))
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith('/course-menu/order'))?.body).toEqual({
        imageIds: ['i1', 'i3', 'i2'],
      }),
    )
    // 続けて 2 枚目（i3）を 1 つ上へ → i3, i1, i2
    await userEvent.click(screen.getByRole('button', { name: '上へ 2' }))
    await waitFor(() =>
      expect(calls.filter((c) => c.path.endsWith('/course-menu/order')).at(-1)?.body).toEqual({
        imageIds: ['i3', 'i1', 'i2'],
      }),
    )
  })

  it('コース表の画像の削除は確認してから送る', async () => {
    const { calls } = mockFetch({
      ...detailRoutes(),
      [`DELETE ${DETAIL}/course-menu/images/i2`]: () => ({ status: 204 }),
    })
    renderApp(`/tenants/${TENANT_ID}`)
    await screen.findByText('3 枚')
    await userEvent.click(screen.getAllByRole('button', { name: '編集' })[1] as HTMLElement)
    await userEvent.click(await screen.findByRole('button', { name: '削除 2' }))
    const dialog = await screen.findByRole('dialog')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    await userEvent.click(within(dialog).getByRole('button', { name: '削除する' }))
    await waitFor(() => expect(screen.getByText('2 枚')).toBeInTheDocument())
  })

  it('各画面への導線がある', async () => {
    mockFetch(detailRoutes())
    renderApp(`/tenants/${TENANT_ID}`)
    for (const [name, path] of [
      ['URL の発行', 'urls'],
      ['写真管理', 'photos'],
      ['参加者管理', 'guests'],
      ['参加者画面のプレビュー', 'preview'],
    ] as const) {
      expect(await screen.findByRole('link', { name })).toHaveAttribute(
        'href',
        `/tenants/${TENANT_ID}/${path}`,
      )
    }
  })
})

describe('監視ツールの URL', () => {
  it('未設定なら Cloudflare のダッシュボード、設定されていればその URL', () => {
    expect(monitoringUrl('')).toBe('https://dash.cloudflare.com/')
    expect(monitoringUrl(undefined)).toBe('https://dash.cloudflare.com/')
    expect(monitoringUrl('https://example.com/mon')).toBe('https://example.com/mon')
  })
})
