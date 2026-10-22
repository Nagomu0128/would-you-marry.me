import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { resetWelcomeMemory } from '../lib/welcome-storage'
import { config, json, meResponse, mockFetch, renderApp } from '../test-utils'

// 端末の「動きを減らす」設定。Motion はファイルごとに一度だけ読むので、このファイルで分けて確かめる
beforeAll(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
  window.localStorage.clear()
  resetWelcomeMemory()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('動きを減らす設定のニックネーム登録', () => {
  it('紙を折らず、通信が終わったらそのままホームへ移る', async () => {
    const user = userEvent.setup()
    let registered = false
    mockFetch({
      ...config,
      'GET /api/t/t1/photos': () => json({ photos: [], nextCursor: null }),
      'GET /api/t/t1/me': () => json(registered ? meResponse('たろう') : meResponse(null, false)),
      'PUT /api/t/t1/me/nickname': () => {
        registered = true
        return json(meResponse('たろう'))
      },
    })
    renderApp('/t/t1/nickname')
    await user.type(await screen.findByRole('textbox', { name: 'ニックネーム' }), 'たろう')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: '記帳する' }))

    expect(screen.queryByTestId('orizuru-stage')).not.toBeInTheDocument()
    expect(await screen.findByText('こんにちは、たろう さん')).toBeInTheDocument()
    expect(screen.queryByTestId('orizuru-stage')).not.toBeInTheDocument()
  })
})
