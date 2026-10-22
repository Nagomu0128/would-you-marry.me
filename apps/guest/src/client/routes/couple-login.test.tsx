import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { resetWelcomeMemory } from '../lib/welcome-storage'
import { apiError, config, json, mockFetch } from '../test-utils'

function Probe() {
  const location = useLocation()
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/couple/t1/login']}>
      <Probe />
      <App />
    </MemoryRouter>,
  )
}

const loginState = (needsTermsAgreement: boolean) => ({
  'GET /api/couple/t1/login': () =>
    json({ tenantName: '〇〇家・△△家 結婚式', needsTermsAgreement }),
})

const photosHandlers = {
  'GET /api/couple/t1/me': () =>
    json({
      tenant: { id: 't1', name: '〇〇家・△△家 結婚式', eventDate: '2026-10-31', phase: 'viewing' },
    }),
  'GET /api/couple/t1/uploaders': () => json({ uploaders: [] }),
  'GET /api/couple/t1/photos': () => json({ photos: [], nextCursor: null }),
}

const passcodeInput = () => screen.getByLabelText('パスコード')
const submitButton = () => screen.getByRole('button', { name: '入る' })

beforeEach(() => {
  window.localStorage.clear()
  resetWelcomeMemory()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SC-01 パスコード入力', () => {
  it('見出し・結婚式の名前・説明を表示し、入力欄は大文字入力の設定にする', async () => {
    mockFetch({ ...config, ...loginState(false) })
    renderLogin()
    expect(await screen.findByRole('heading', { name: 'おふたりへ' })).toBeInTheDocument()
    expect(screen.getByText('〇〇家・△△家 結婚式')).toBeInTheDocument()
    expect(screen.getByText('管理者からお伝えしたパスコードを入力してください')).toBeInTheDocument()
    expect(passcodeInput()).toHaveAttribute('autocapitalize', 'characters')
    expect(passcodeInput()).not.toHaveAttribute('autocomplete', 'one-time-code')
    // フッターは新郎新婦用ページにも出る
    expect(screen.getByRole('link', { name: '利用規約' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'お問い合わせ' })).toBeInTheDocument()
  })

  it('初回は同意しないと押せず、同意すると agreeToTerms を付けて送る', async () => {
    const user = userEvent.setup()
    const { calls } = mockFetch({
      ...config,
      ...loginState(true),
      'POST /api/couple/t1/login': () => json({}),
      ...photosHandlers,
    })
    window.localStorage.setItem('wym:couple-celebration-played:t1', '1')
    renderLogin()
    await screen.findByRole('heading', { name: 'おふたりへ' })
    await user.type(passcodeInput(), 'ab12cd34')
    expect(submitButton()).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    expect(submitButton()).toBeEnabled()
    await user.click(submitButton())
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/couple/t1/photos'),
    )
    const post = calls.find((c) => c.key === 'POST /api/couple/t1/login')
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      passcode: 'ab12cd34',
      agreeToTerms: true,
    })
  })

  it('2 回目以降は同意欄を出さない', async () => {
    mockFetch({ ...config, ...loginState(false) })
    renderLogin()
    await screen.findByRole('heading', { name: 'おふたりへ' })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(submitButton()).toBeEnabled()
  })

  it('空のまま送ると入力を促し、API を呼ばない', async () => {
    const user = userEvent.setup()
    const { calls } = mockFetch({ ...config, ...loginState(false) })
    renderLogin()
    await screen.findByRole('heading', { name: 'おふたりへ' })
    await user.click(submitButton())
    expect(await screen.findByText('パスコードを入力してください')).toBeInTheDocument()
    expect(calls.some((c) => c.key === 'POST /api/couple/t1/login')).toBe(false)
  })

  it('間違えたら残りの回数を表示する', async () => {
    const user = userEvent.setup()
    mockFetch({
      ...config,
      ...loginState(false),
      'POST /api/couple/t1/login': () =>
        apiError('PASSCODE_INVALID', 401, { remainingAttempts: 3 }),
    })
    renderLogin()
    await screen.findByRole('heading', { name: 'おふたりへ' })
    await user.type(passcodeInput(), 'WRONG')
    await user.click(submitButton())
    expect(await screen.findByText('パスコードが違います（あと 3 回）')).toBeInTheDocument()
    expect(passcodeInput()).toBeEnabled()
  })

  it('ロック中は入力欄とボタンを押せなくして分を切り上げて表示し、時間が過ぎたら戻る', async () => {
    mockFetch({
      ...config,
      ...loginState(false),
      'POST /api/couple/t1/login': () =>
        apiError('PASSCODE_LOCKED', 429, { retryAfterSeconds: 61 }),
    })
    renderLogin()
    await screen.findByRole('heading', { name: 'おふたりへ' })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    fireEvent.change(passcodeInput(), { target: { value: 'WRONG' } })
    fireEvent.click(submitButton())
    // タイマーを偽物にしているので、待たずに進めて反映させる
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(
      screen.getByText('入力できる回数を超えました。約 2 分後にお試しください'),
    ).toBeInTheDocument()
    expect(passcodeInput()).toBeDisabled()
    expect(submitButton()).toBeDisabled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(passcodeInput()).toBeDisabled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500)
    })
    expect(passcodeInput()).toBeEnabled()
    expect(submitButton()).toBeEnabled()
    expect(screen.queryByText(/入力できる回数を超えました/)).not.toBeInTheDocument()
  })

  it('成功すると、初回だけお祝いの演出を再生してから写真一覧へ移動する', async () => {
    const user = userEvent.setup()
    mockFetch({
      ...config,
      ...loginState(false),
      'POST /api/couple/t1/login': () => json({}),
      ...photosHandlers,
    })
    const first = renderLogin()
    await screen.findByRole('heading', { name: 'おふたりへ' })
    await user.type(passcodeInput(), 'AB12CD34')
    await user.click(submitButton())

    const skip = await screen.findByRole('button', { name: '演出を飛ばす' })
    expect(screen.getByTestId('location')).toHaveTextContent('/couple/t1/login')
    fireEvent.click(skip)
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/couple/t1/photos'),
    )
    expect(window.localStorage.getItem('wym:couple-celebration-played:t1')).toBe('1')
    first.unmount()

    // 2 回目は演出なしで写真一覧へ
    renderLogin()
    await screen.findByRole('heading', { name: 'おふたりへ' })
    await user.type(passcodeInput(), 'AB12CD34')
    await user.click(submitButton())
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/couple/t1/photos'),
    )
    expect(screen.queryByRole('button', { name: '演出を飛ばす' })).not.toBeInTheDocument()
  })

  it('COUPLE_LINK_INVALID ではエラー画面（新郎新婦向け）へ移動する', async () => {
    mockFetch({
      ...config,
      'GET /api/couple/t1/login': () => apiError('COUPLE_LINK_INVALID', 403),
    })
    renderLogin()
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/error?code=COUPLE_LINK_INVALID&audience=couple',
      ),
    )
    expect(
      await screen.findByText('この URL は使えなくなっています', { exact: false }),
    ).toBeInTheDocument()
  })
})
