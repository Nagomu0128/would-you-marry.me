import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, NetworkError } from './lib/api'
import { resolveApiError } from './lib/error-handling'
import { resetWelcomeMemory } from './lib/welcome-storage'
import { apiError, config, json, meResponse, mockFetch, renderApp } from './test-utils'

const emptyPhotos = { 'GET /api/t/t1/photos': () => json({ photos: [], nextCursor: null }) }

beforeEach(() => {
  window.localStorage.clear()
  resetWelcomeMemory()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ニックネーム登録（初回）', () => {
  it('同意するまで押せず、使用中の名前ではエラーを出し、成功でホームへ進む', async () => {
    const user = userEvent.setup()
    let registered = false
    let attempts = 0
    const { calls } = mockFetch({
      ...config,
      ...emptyPhotos,
      'GET /api/t/t1/me': () => json(registered ? meResponse('たろう') : meResponse(null, false)),
      'PUT /api/t/t1/me/nickname': () => {
        attempts += 1
        if (attempts === 1) return apiError('NICKNAME_TAKEN', 409)
        registered = true
        return json(meResponse('たろう'))
      },
    })
    renderApp('/t/t1/nickname')

    const input = await screen.findByRole('textbox')
    const submit = screen.getByRole('button', { name: 'はじめる' })
    expect(submit).toBeDisabled()
    expect(screen.getByText('0 / 20')).toBeInTheDocument()

    await user.type(input, 'たろう')
    expect(screen.getByText('3 / 20')).toBeInTheDocument()
    expect(submit).toBeDisabled() // 同意がまだ

    await user.click(screen.getByRole('checkbox'))
    expect(submit).toBeEnabled()

    await user.click(submit)
    expect(
      await screen.findByText('この名前は使われています。別の名前を入力してください'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'はじめる' }))
    expect(await screen.findByText('こんにちは、たろう さん')).toBeInTheDocument()

    const put = calls.filter((call) => call.key === 'PUT /api/t/t1/me/nickname')
    expect(JSON.parse(String(put[1]?.init?.body))).toEqual({
      nickname: 'たろう',
      agreeToTerms: true,
    })
  })

  it('21 文字以上は押せない', async () => {
    const user = userEvent.setup()
    mockFetch({ ...config, 'GET /api/t/t1/me': () => json(meResponse(null, false)) })
    renderApp('/t/t1/nickname')
    await user.type(await screen.findByRole('textbox'), 'あ'.repeat(21))
    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'はじめる' })).toBeDisabled()
    expect(screen.getByText('ニックネームは 20 文字以内で入力してください')).toBeInTheDocument()
  })
})

describe('ニックネーム変更', () => {
  it('同意欄がなく、成功するとホームに戻ってトーストを出す', async () => {
    const user = userEvent.setup()
    mockFetch({
      ...config,
      ...emptyPhotos,
      'GET /api/t/t1/me': () => json(meResponse('たろう')),
      'PUT /api/t/t1/me/nickname': () => json(meResponse('じろう')),
    })
    renderApp('/t/t1/nickname')

    const input = await screen.findByRole('textbox')
    expect(input).toHaveValue('たろう')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ニックネームの変更' })).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, 'じろう')
    await user.click(screen.getByRole('button', { name: '変更する' }))

    expect(await screen.findByText('ニックネームを変更しました')).toBeInTheDocument()
    expect(await screen.findByText(/こんにちは/)).toBeInTheDocument()
  })
})

describe('エラーの振り分け', () => {
  it('UNAUTHENTICATED は /error の画面へ移動する', async () => {
    mockFetch({ ...config, 'GET /api/t/t1/me': () => apiError('UNAUTHENTICATED', 401) })
    renderApp('/t/t1')
    expect(
      await screen.findByText('受付でお渡しした QR コードを読み取ってください'),
    ).toBeInTheDocument()
  })

  it('NICKNAME_REQUIRED はニックネーム画面へ移動する', async () => {
    mockFetch({
      ...config,
      'GET /api/t/t1/me': () => json(meResponse(null, false)),
      'GET /api/t/t1/seating-chart': () => apiError('NICKNAME_REQUIRED', 403),
    })
    renderApp('/t/t1/seating')
    expect(await screen.findByRole('button', { name: 'はじめる' })).toBeInTheDocument()
  })

  it('通信エラーは画面内に「もう一度試す」を出し、押すと読み込み直す', async () => {
    const user = userEvent.setup()
    let online = false
    mockFetch({
      ...config,
      ...emptyPhotos,
      'GET /api/t/t1/me': () => {
        if (!online) throw new TypeError('Failed to fetch')
        return json(meResponse('たろう'))
      },
    })
    renderApp('/t/t1')
    expect(
      await screen.findByText('通信できませんでした。電波の良い場所でもう一度お試しください'),
    ).toBeInTheDocument()
    online = true
    await user.click(screen.getByRole('button', { name: 'もう一度試す' }))
    expect(await screen.findByText('こんにちは、たろう さん')).toBeInTheDocument()
  })

  it('それ以外のエラーはトーストにする', async () => {
    mockFetch({ ...config, 'GET /api/t/t1/me': () => apiError('INTERNAL_ERROR', 500) })
    renderApp('/t/t1')
    expect(
      await screen.findByText('エラーが発生しました。時間をおいてもう一度お試しください'),
    ).toBeInTheDocument()
  })

  it('resolveApiError の振り分け', () => {
    const err = (code: ConstructorParameters<typeof ApiClientError>[0], status: number) =>
      new ApiClientError(code, status, { code, message: code })
    expect(resolveApiError(err('TENANT_SUSPENDED', 403), { tenantId: 't1' })).toEqual({
      type: 'redirect',
      to: '/error?code=TENANT_SUSPENDED',
    })
    expect(resolveApiError(err('PERIOD_ENDED', 403), { audience: 'couple' })).toEqual({
      type: 'redirect',
      to: '/error?code=PERIOD_ENDED&audience=couple',
    })
    expect(resolveApiError(err('NICKNAME_REQUIRED', 403), { tenantId: 't1' })).toEqual({
      type: 'redirect',
      to: '/t/t1/nickname',
    })
    expect(resolveApiError(new NetworkError())).toEqual({ type: 'network' })
    expect(resolveApiError(err('FORBIDDEN', 403))).toEqual({
      type: 'toast',
      message: 'この操作はできません',
    })
  })
})

describe('エラー画面', () => {
  it('参加者向けの文言と問い合わせボタンを出し、下部ナビは出さない', async () => {
    mockFetch({ ...config })
    renderApp('/error?code=OUTSIDE_JOINING_PERIOD')
    expect(
      await screen.findByRole('heading', { name: '参加の受付期間ではありません' }),
    ).toBeInTheDocument()
    expect(screen.getByText('受付は結婚式の当日と翌日です。')).toBeInTheDocument()
    const contact = await waitFor(() => {
      const links = screen.getAllByRole('link', { name: 'お問い合わせ' })
      expect(links.length).toBeGreaterThan(0)
      return links[0]
    })
    expect(contact).toHaveAttribute('href', 'mailto:help@example.com')
    expect(screen.queryByText('アルバム')).not.toBeInTheDocument()
  })

  it('audience=couple は新郎新婦向けの文言', async () => {
    mockFetch({ ...config })
    renderApp('/error?code=PERIOD_ENDED&audience=couple')
    expect(await screen.findByText('ご利用ありがとうございました。')).toBeInTheDocument()
  })

  it('UNAUTHENTICATED は参加者と新郎新婦で文言が違う', async () => {
    mockFetch({ ...config })
    renderApp('/error?code=UNAUTHENTICATED&audience=couple')
    expect(
      await screen.findByRole('heading', { name: '管理者からお知らせした URL を開いてください' }),
    ).toBeInTheDocument()
  })
})

describe('ホームのウェルカム演出', () => {
  const homeHandlers = {
    ...config,
    ...emptyPhotos,
    'GET /api/t/t1/me': () => json(meResponse('たろう')),
  }

  it.each(['遅延', '通信失敗'])('新着写真が%sしても式の案内と投稿を使える', async (state) => {
    window.localStorage.setItem('wym:welcome-played:t1', '1')
    mockFetch({
      ...homeHandlers,
      'GET /api/t/t1/photos': () => {
        if (state === '通信失敗') throw new TypeError('Failed to fetch')
        return new Promise<Response>(() => {})
      },
    })
    renderApp('/t/t1')
    expect(await screen.findByText('こんにちは、たろう さん')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '写真を投稿する' })).toHaveAttribute(
      'href',
      '/t/t1/upload',
    )
    expect(screen.getByRole('navigation', { name: 'メインメニュー' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'もう一度試す' })).not.toBeInTheDocument()
  })

  it('初回だけ再生し、飛ばすと保存される', async () => {
    mockFetch(homeHandlers)
    const first = renderApp('/t/t1')
    const skip = await screen.findByRole('button', { name: '演出を飛ばす' })
    fireEvent.click(skip)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '演出を飛ばす' })).not.toBeInTheDocument(),
    )
    expect(window.localStorage.getItem('wym:welcome-played:t1')).toBe('1')
    first.unmount()

    renderApp('/t/t1')
    expect(await screen.findByText('こんにちは、たろう さん')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '演出を飛ばす' })).not.toBeInTheDocument()
  })

  it('localStorage が使えなくても壊れず、このページの間は繰り返さない', async () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    mockFetch(homeHandlers)
    const first = renderApp('/t/t1')
    fireEvent.click(await screen.findByRole('button', { name: '演出を飛ばす' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '演出を飛ばす' })).not.toBeInTheDocument(),
    )
    first.unmount()

    renderApp('/t/t1')
    expect(await screen.findByText('こんにちは、たろう さん')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '演出を飛ばす' })).not.toBeInTheDocument()
  })

  it('日付をアクセント書体で出し、新着 3 枚をアルバムのカードに出す', async () => {
    window.localStorage.setItem('wym:welcome-played:t1', '1')
    const photo = (id: string) => ({
      id,
      uploader: { nickname: 'はなこ' },
      likeCount: 0,
      likedByMe: false,
      isMine: false,
      width: 10,
      height: 10,
      createdAt: '2026-10-31T00:00:00.000Z',
      urls: { thumb: `/thumb/${id}`, display: `/d/${id}`, original: `/o/${id}` },
    })
    const { calls } = mockFetch({
      ...config,
      'GET /api/t/t1/me': () => json(meResponse('たろう')),
      'GET /api/t/t1/photos': () =>
        json({ photos: [photo('a'), photo('b'), photo('c')], nextCursor: null }),
    })
    renderApp('/t/t1')
    expect(await screen.findByText('2026.10.31')).toBeInTheDocument()
    expect(screen.getAllByAltText('はなこ さんの写真')).toHaveLength(3)
    expect(screen.getByText('新着')).toBeInTheDocument()
    expect(calls.some((call) => call.key === 'GET /api/t/t1/photos')).toBe(true)
  })
})

describe('席次表・コース表の未登録', () => {
  it('席次表', async () => {
    mockFetch({ ...config, 'GET /api/t/t1/seating-chart': () => apiError('NOT_FOUND', 404) })
    renderApp('/t/t1/seating')
    expect(await screen.findByText('席次表は準備中です')).toBeInTheDocument()
  })

  it('コース表', async () => {
    mockFetch({ ...config, 'GET /api/t/t1/course-menu': () => json({ images: [] }) })
    renderApp('/t/t1/menu')
    expect(await screen.findByText('コースのご案内は準備中です')).toBeInTheDocument()
  })

  it('コース表の画像をタップすると拡大表示になる', async () => {
    const user = userEvent.setup()
    mockFetch({
      ...config,
      'GET /api/t/t1/course-menu': () => json({ images: [{ id: 'i1', url: '/img/1' }] }),
    })
    renderApp('/t/t1/menu')
    await user.click(await screen.findByRole('button', { name: /料理のコース 1/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('レイアウト', () => {
  it('SG-03〜SG-07 には下部ナビがあり、SG-02 にはない', async () => {
    mockFetch({
      ...config,
      'GET /api/t/t1/course-menu': () => json({ images: [] }),
      'GET /api/t/t1/me': () => json(meResponse(null, false)),
    })
    const view = renderApp('/t/t1/menu')
    expect(await screen.findByRole('link', { name: '席次表' })).toBeInTheDocument()
    view.unmount()

    renderApp('/t/t1/nickname')
    await screen.findByRole('textbox')
    expect(screen.queryByRole('link', { name: '席次表' })).not.toBeInTheDocument()
  })

  it('利用規約に FR-G-14 の項目がある', async () => {
    mockFetch({ ...config })
    renderApp('/terms')
    expect(
      await screen.findByText(/同じ結婚式の参加者、新郎新婦、本サービスの管理者に共有/),
    ).toBeInTheDocument()
    expect(screen.getByText(/復元できません/)).toBeInTheDocument()
  })
})
