import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetWelcomeMemory } from '../lib/welcome-storage'
import { apiError, config, json, meResponse, mockFetch, renderApp } from '../test-utils'
import { FakeXhr, installFakeXhr, lastXhr } from '../test-xhr'

const createResizedImages = vi.hoisted(() => vi.fn())
vi.mock('../lib/resize', async (importActual) => ({
  ...(await importActual<typeof import('../lib/resize')>()),
  createResizedImages,
}))

const jpeg = (size = 100) => {
  const bytes = new Uint8Array(size)
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  return new File([bytes], 'a.jpg', { type: 'image/jpeg' })
}

function meWith(photoCount: number) {
  const base = meResponse('たろう')
  return { ...base, me: { ...base.me, photoCount } }
}

function setup(photoCount = 12) {
  mockFetch({ ...config, 'GET /api/t/t1/me': () => json(meWith(photoCount)) })
  installFakeXhr()
  return renderApp('/t/t1/upload')
}

async function pick(file: File, testId = 'choose-input') {
  const input = await screen.findByTestId(testId)
  fireEvent.change(input, { target: { files: [file] } })
}

beforeEach(() => {
  window.localStorage.clear()
  resetWelcomeMemory()
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  createResizedImages.mockReset()
  createResizedImages.mockResolvedValue({
    display: new Blob(['d']),
    thumb: new Blob(['t']),
    width: 1200,
    height: 1600,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const submitButton = () => screen.getByRole('button', { name: '投稿する' })

describe('SG-07 フォトアップロード', () => {
  it('残り枚数を出し、カメラ用の入力には capture を付ける', async () => {
    setup(12)
    expect(await screen.findByText('あと 88 枚投稿できます')).toBeInTheDocument()
    expect(screen.getByTestId('camera-input')).toHaveAttribute('capture', 'environment')
    expect(screen.getByTestId('camera-input')).toHaveAttribute('accept', 'image/*')
    expect(screen.getByTestId('choose-input')).toHaveAttribute('accept', 'image/jpeg,image/png')
  })

  it('HEIC は選んだ時点でエラー、10MB 超もエラー。プレビューは出ない', async () => {
    setup()
    const heic = new File([new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70])], 'a.heic')
    await pick(heic)
    expect(
      await screen.findByText('この形式の写真は投稿できません（JPEG・PNG のみ）'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()

    await pick(jpeg(10 * 1024 * 1024 + 1))
    expect(await screen.findByText('写真のサイズが大きすぎます（10MB まで）')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '投稿する' })).not.toBeInTheDocument()
  })

  it('選ぶとプレビューが出て、送信中は進捗を出し、完了で演出・トースト・ボタンが出る', async () => {
    setup(12)
    await pick(jpeg())
    expect(await screen.findByAltText('選んだ写真')).toBeInTheDocument()

    await userEvent.setup().click(submitButton())
    await waitFor(() => expect(lastXhr()).toBeDefined())
    act(() => lastXhr()?.progress(60, 100))
    expect(await screen.findByText('60%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60')

    // 送信中は選ぶボタンが押せない
    expect(screen.getByRole('button', { name: '写真を選ぶ' })).toBeDisabled()

    act(() => lastXhr()?.respond(201, { photo: { id: 'p1' } }))
    expect(await screen.findByText('写真を投稿しました')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '続けて投稿する' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'アルバムを見る' })).toHaveAttribute(
      'href',
      '/t/t1/album',
    )

    await userEvent.setup().click(screen.getByRole('button', { name: '続けて投稿する' }))
    expect(await screen.findByText('あと 87 枚投稿できます')).toBeInTheDocument()
    expect(screen.queryByAltText('選んだ写真')).not.toBeInTheDocument()
  })

  it('失敗したら「もう一度送る」で、縮小画像を作り直さずに再送できる', async () => {
    setup()
    const user = userEvent.setup()
    await pick(jpeg())
    await user.click(await screen.findByRole('button', { name: '投稿する' }))
    await waitFor(() => expect(lastXhr()).toBeDefined())
    act(() => lastXhr()?.fail())

    expect(await screen.findByText('送信できませんでした')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'もう一度送る' }))
    await waitFor(() => expect(FakeXhr.instances.length).toBe(2))
    expect(createResizedImages).toHaveBeenCalledTimes(1)
    act(() => lastXhr()?.respond(201, { photo: { id: 'p1' } }))
    expect(await screen.findByText('写真を投稿しました')).toBeInTheDocument()
  })

  it('API のエラーは messages.md の文言で出し、選び直せる', async () => {
    setup()
    const user = userEvent.setup()
    await pick(jpeg())
    await user.click(await screen.findByRole('button', { name: '投稿する' }))
    await waitFor(() => expect(lastXhr()).toBeDefined())
    act(() => lastXhr()?.respond(415, { error: { code: 'UNSUPPORTED_FILE_TYPE', message: 'x' } }))
    expect(
      await screen.findByText('この形式の写真は投稿できません（JPEG・PNG のみ）'),
    ).toBeInTheDocument()
    expect(screen.queryByAltText('選んだ写真')).not.toBeInTheDocument()
  })

  it('送信で上限に達したと分かったら、選ぶボタンが押せなくなる', async () => {
    setup()
    const user = userEvent.setup()
    await pick(jpeg())
    await user.click(await screen.findByRole('button', { name: '投稿する' }))
    await waitFor(() => expect(lastXhr()).toBeDefined())
    act(() => lastXhr()?.respond(409, { error: { code: 'UPLOAD_LIMIT_REACHED', message: 'x' } }))
    expect(await screen.findByText('投稿できる枚数（100 枚）に達しました')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '写真を選ぶ' })).toBeDisabled()
  })

  it('認証の切れなどは /error へ移動する', async () => {
    setup()
    const user = userEvent.setup()
    await pick(jpeg())
    await user.click(await screen.findByRole('button', { name: '投稿する' }))
    await waitFor(() => expect(lastXhr()).toBeDefined())
    act(() => lastXhr()?.respond(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }))
    expect(
      await screen.findByText('受付でお渡しした QR コードを読み取ってください'),
    ).toBeInTheDocument()
  })

  it('上限に達しているときは選ぶボタンが押せず、理由を出す', async () => {
    setup(100)
    expect(await screen.findByText('投稿できる枚数（100 枚）に達しました')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '撮影する' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '写真を選ぶ' })).toBeDisabled()
  })

  it('送信中だけ、画面を離れるときに警告する', async () => {
    setup()
    const user = userEvent.setup()
    await pick(jpeg())
    const before = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(before)
    expect(before.defaultPrevented).toBe(false)

    await user.click(await screen.findByRole('button', { name: '投稿する' }))
    await waitFor(() => expect(lastXhr()).toBeDefined())
    const during = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(during)
    expect(during.defaultPrevented).toBe(true)
  })

  it('通信エラー（/me）は「もう一度試す」を出す', async () => {
    mockFetch({ ...config, 'GET /api/t/t1/me': () => apiError('INTERNAL_ERROR', 500) })
    renderApp('/t/t1/upload')
    expect(await screen.findByRole('button', { name: 'もう一度試す' })).toBeInTheDocument()
  })
})
