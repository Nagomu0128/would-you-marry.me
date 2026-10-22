import { act, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetWelcomeMemory } from '../lib/welcome-storage'
import { apiError, config, json, meResponse, mockFetch, renderApp } from '../test-utils'

// SG-02: 送信すると芳名帳の紙が折り鶴になって飛び立ち、通信は並行して行う
const emptyPhotos = { 'GET /api/t/t1/photos': () => json({ photos: [], nextCursor: null }) }
const PUT = 'PUT /api/t/t1/me/nickname'

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

beforeEach(() => {
  window.localStorage.clear()
  resetWelcomeMemory()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function fillFirstVisit(name: string) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  await user.type(await screen.findByRole('textbox', { name: 'ニックネーム' }), name)
  await user.click(screen.getByRole('checkbox'))
  return user
}

describe('ニックネーム登録の演出', () => {
  it('送信するとすぐに API を呼び、鶴が飛び去ってからホームへ移る', async () => {
    let registered = false
    const { calls } = mockFetch({
      ...config,
      ...emptyPhotos,
      'GET /api/t/t1/me': () => json(registered ? meResponse('たろう') : meResponse(null, false)),
      [PUT]: () => {
        registered = true
        return json(meResponse('たろう'))
      },
    })
    renderApp('/t/t1/nickname')
    const user = await fillFirstVisit('たろう')

    await user.click(screen.getByRole('button', { name: '記帳する' }))
    // 折り始めと同時に通信する
    expect(calls.filter((c) => c.key === PUT)).toHaveLength(1)
    expect(screen.getByTestId('orizuru-stage')).toBeInTheDocument()
    expect(screen.getByText('記帳しています', { selector: '[role="status"]' })).toBeInTheDocument()

    // 通信は終わっていても、鶴が飛んでいるあいだはまだ移らない
    await act(() => vi.advanceTimersByTimeAsync(1200))
    expect(screen.queryByText('こんにちは、たろう さん')).not.toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(await screen.findByText('こんにちは、たろう さん')).toBeInTheDocument()
    expect(screen.queryByTestId('orizuru-stage')).not.toBeInTheDocument()
  })

  it('失敗すると鶴が紙に戻ってからエラーを出し、入力を残す', async () => {
    const response = deferred<Response>()
    mockFetch({
      ...config,
      'GET /api/t/t1/me': () => json(meResponse(null, false)),
      [PUT]: () => response.promise,
    })
    renderApp('/t/t1/nickname')
    const user = await fillFirstVisit('たろう')
    await user.click(screen.getByRole('button', { name: '記帳する' }))

    // 鶴が飛び立ったあとに失敗が返る
    await act(() => vi.advanceTimersByTimeAsync(1600))
    response.resolve(apiError('NICKNAME_TAKEN', 409))
    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(screen.getByTestId('orizuru-stage')).toBeInTheDocument()
    expect(
      screen.queryByText('この名前は使われています。別の名前を入力してください'),
    ).not.toBeInTheDocument()

    // 降りてきて（約 0.45 秒）、紙に開き戻る（約 0.6 秒）
    await act(() => vi.advanceTimersByTimeAsync(1400))
    expect(screen.queryByTestId('orizuru-stage')).not.toBeInTheDocument()
    expect(
      screen.getByText('この名前は使われています。別の名前を入力してください'),
    ).toBeInTheDocument()
    const input = screen.getByRole('textbox', { name: 'ニックネーム' })
    expect(input).toHaveValue('たろう')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveFocus()
    expect(screen.getByRole('button', { name: '記帳する' })).toBeEnabled()
  })

  it('同じ送信を二度しない', async () => {
    const response = deferred<Response>()
    const { calls } = mockFetch({
      ...config,
      'GET /api/t/t1/me': () => json(meResponse(null, false)),
      [PUT]: () => response.promise,
    })
    renderApp('/t/t1/nickname')
    const user = await fillFirstVisit('たろう')
    const form = screen.getByRole('button', { name: '記帳する' }).closest('form')
    if (!form) throw new Error('form not found')

    fireEvent.submit(form)
    fireEvent.submit(form)
    await user.click(screen.getByRole('button', { name: '記帳する' }))
    expect(calls.filter((c) => c.key === PUT)).toHaveLength(1)
    // 演出中は入力欄に触れられない
    expect(screen.getByRole('textbox', { hidden: true }).closest('[inert]')).not.toBeNull()
  })

  it('通信エラーは紙に戻ってから「もう一度試す」を出し、押すと送り直す', async () => {
    let online = false
    const { calls } = mockFetch({
      ...config,
      ...emptyPhotos,
      'GET /api/t/t1/me': () => json(online ? meResponse('たろう') : meResponse(null, false)),
      [PUT]: () => {
        if (!online) throw new TypeError('Failed to fetch')
        return json(meResponse('たろう'))
      },
    })
    renderApp('/t/t1/nickname')
    const user = await fillFirstVisit('たろう')
    await user.click(screen.getByRole('button', { name: '記帳する' }))
    await act(() => vi.advanceTimersByTimeAsync(800))

    const retry = await screen.findByRole('button', { name: 'もう一度試す' })
    expect(screen.queryByTestId('orizuru-stage')).not.toBeInTheDocument()
    online = true
    await user.click(retry)
    expect(calls.filter((c) => c.key === PUT)).toHaveLength(2)
    await act(() => vi.advanceTimersByTimeAsync(3000))
    expect(await screen.findByText('こんにちは、たろう さん')).toBeInTheDocument()
  })
})

describe('ニックネーム変更の演出', () => {
  it('短い版の折りと飛翔のあとにホームへ戻り、トーストを出す', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockFetch({
      ...config,
      ...emptyPhotos,
      'GET /api/t/t1/me': () => json(meResponse('たろう')),
      [PUT]: () => json(meResponse('じろう')),
    })
    renderApp('/t/t1/nickname')
    const input = await screen.findByRole('textbox', { name: 'ニックネーム' })
    await user.clear(input)
    await user.type(input, 'じろう')
    await user.click(screen.getByRole('button', { name: '変更する' }))
    expect(screen.getByTestId('orizuru-stage')).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(screen.queryByText('ニックネームを変更しました')).not.toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(await screen.findByText('ニックネームを変更しました')).toBeInTheDocument()
    expect(await screen.findByText(/こんにちは/)).toBeInTheDocument()
  })
})
