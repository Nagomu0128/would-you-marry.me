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

async function pickMany(files: File[], testId = 'choose-input') {
  const input = await screen.findByTestId(testId)
  fireEvent.change(input, { target: { files } })
}

const jpegs = (count: number) => Array.from({ length: count }, () => jpeg())
const heic = () => new File([new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70])], 'a.heic')

/** n 番目（1 始まり）の送信が始まるのを待つ */
async function xhrAt(n: number) {
  await waitFor(() => expect(FakeXhr.instances.length).toBeGreaterThanOrEqual(n))
  const xhr = FakeXhr.instances[n - 1]
  if (!xhr) throw new Error('no xhr')
  return xhr
}

async function respondAt(n: number, status: number, body: unknown) {
  const xhr = await xhrAt(n)
  act(() => xhr.respond(status, body))
}

const ok = { photo: { id: 'p' } }
const itemElements = () => Array.from(document.querySelectorAll('.upload-grid > li'))
const statusesOnScreen = () => itemElements().map((li) => li.getAttribute('data-status'))

beforeEach(() => {
  window.localStorage.clear()
  resetWelcomeMemory()
  let urlSeq = 0
  URL.createObjectURL = vi.fn(() => `blob:preview-${++urlSeq}`)
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

const KEY_HEADER = 'Idempotency-Key'
const keyOf = (n: number) => FakeXhr.instances[n - 1]?.headers[KEY_HEADER]

const submitButton = () => screen.getByRole('button', { name: '投稿する' })

describe('SG-07 フォトアップロード', () => {
  it('残り枚数を出し、カメラ用の入力には capture を付ける', async () => {
    setup(12)
    expect(await screen.findByText('あと 488 枚投稿できます')).toBeInTheDocument()
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
    expect(await screen.findByText('あと 487 枚投稿できます')).toBeInTheDocument()
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
    expect(await screen.findByText('投稿できる枚数（500 枚）に達しました')).toBeInTheDocument()
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
    setup(500)
    expect(await screen.findByText('投稿できる枚数（500 枚）に達しました')).toBeInTheDocument()
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

  it('複数枚を選ぶと、3 列の一覧になり、投稿ボタンに枚数が出る', async () => {
    setup(12)
    expect(await screen.findByTestId('choose-input')).toHaveAttribute('multiple')
    expect(screen.getByTestId('camera-input')).not.toHaveAttribute('multiple')
    await pickMany(jpegs(3))
    expect(await screen.findByText('3 枚を選んでいます')).toBeInTheDocument()
    expect(await screen.findByAltText('選んだ写真 3 枚目')).toBeInTheDocument()
    expect(itemElements()).toHaveLength(3)
    expect(screen.getByRole('button', { name: '3 枚を投稿する' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2 枚目の写真を外す' })).toBeInTheDocument()
    // 縮小は 1 枚ずつ、選んだ直後に始まっている
    await waitFor(() => expect(createResizedImages).toHaveBeenCalledTimes(3))
  })

  it('縮小は 1 枚ずつ順に行う', async () => {
    setup()
    let running = 0
    let peak = 0
    createResizedImages.mockImplementation(async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
      return { display: new Blob(['d']), thumb: new Blob(['t']), width: 1, height: 1 }
    })
    await pickMany(jpegs(3))
    await waitFor(() => expect(createResizedImages).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(running).toBe(0))
    expect(peak).toBe(1)
  })

  it('一覧用の画像ができるまでは置き場を出す', async () => {
    setup()
    createResizedImages.mockImplementation(() => new Promise(() => {}))
    await pickMany(jpegs(2))
    await screen.findByText('2 枚を選んでいます')
    expect(screen.queryByAltText('選んだ写真 1 枚目')).not.toBeInTheDocument()
    expect(statusesOnScreen()).toEqual(['preparing', 'preparing'])
  })

  it('一度に選べるのは 20 枚まで。超えた分は捨てて理由を出し、選ぶボタンが押せなくなる', async () => {
    setup(12)
    await pickMany(jpegs(25))
    expect(
      await screen.findByText('一度に選べるのは 20 枚までのため、20 枚を加えました'),
    ).toBeInTheDocument()
    expect(screen.getByText('20 枚を選んでいます')).toBeInTheDocument()
    expect(screen.getByText('一度に選べるのは 20 枚までです')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '写真を選ぶ' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '撮影する' })).toBeDisabled()
  })

  it('残りの投稿枚数を超えては選べない', async () => {
    setup(495)
    await pickMany(jpegs(8))
    expect(
      await screen.findByText('投稿できるのはあと 5 枚のため、5 枚を加えました'),
    ).toBeInTheDocument()
    expect(screen.getByText('5 枚を選んでいます')).toBeInTheDocument()
    expect(screen.getByText('投稿できるのはあと 5 枚までです')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '写真を選ぶ' })).toBeDisabled()
  })

  it('選んだ中にだめな写真が混ざると、加えずに枚数と理由を出す', async () => {
    setup()
    await pickMany([jpeg(), heic(), jpeg(), heic(), jpeg(10 * 1024 * 1024 + 1)])
    expect(await screen.findByText('3 枚は投稿できない写真のため、外しました')).toBeInTheDocument()
    expect(screen.getByText('この形式の写真は投稿できません（JPEG・PNG のみ）')).toBeInTheDocument()
    expect(screen.getByText('写真のサイズが大きすぎます（10MB まで）')).toBeInTheDocument()
    expect(screen.getByText('2 枚を選んでいます')).toBeInTheDocument()
  })

  it('撮影した写真は一覧に加わる', async () => {
    setup()
    await pickMany(jpegs(2))
    await screen.findByText('2 枚を選んでいます')
    await pickMany(jpegs(1), 'camera-input')
    expect(await screen.findByText('3 枚を選んでいます')).toBeInTheDocument()
  })

  it('外すと次の写真の外すボタンへ、なければ選ぶボタンへフォーカスが移る', async () => {
    setup()
    const user = userEvent.setup()
    await pickMany(jpegs(3))
    await screen.findByText('3 枚を選んでいます')

    await user.click(screen.getByRole('button', { name: '2 枚目の写真を外す' }))
    expect(screen.getByText('2 枚を選んでいます')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2 枚目の写真を外す' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: '2 枚目の写真を外す' }))
    // 最後の写真を外したので、選ぶボタンへ。1 枚になると大きな台紙になる
    expect(screen.queryByText('1 枚を選んでいます')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '写真を選ぶ' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: '1 枚目の写真を外す' }))
    expect(screen.getByRole('button', { name: '写真を選ぶ' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: '投稿する' })).not.toBeInTheDocument()
    expect(screen.getByText('あと 488 枚投稿できます')).toBeInTheDocument()
  })

  it('外した写真の object URL を手放し、縮小中に外された写真の結果は捨てる', async () => {
    setup()
    const user = userEvent.setup()
    let release: (() => void) | undefined
    createResizedImages.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ display: new Blob(['d']), thumb: new Blob(['t']), width: 1, height: 1 })
        }),
    )
    await pickMany(jpegs(2))
    await screen.findByText('2 枚を選んでいます')
    await user.click(screen.getByRole('button', { name: '1 枚目の写真を外す' }))
    const created = vi.mocked(URL.createObjectURL).mock.calls.length
    // 外された 1 枚目の縮小が終わっても、URL は作らない
    act(() => release?.())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(vi.mocked(URL.createObjectURL).mock.calls.length).toBe(created)
  })

  it('複数枚は 1 枚ずつ順に送り、全体の進捗と写真ごとの状態を出す', async () => {
    setup(12)
    const user = userEvent.setup()
    await pickMany(jpegs(3))
    await user.click(await screen.findByRole('button', { name: '3 枚を投稿する' }))

    const first = await xhrAt(1)
    // 同時に 2 つ目は出ない
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(FakeXhr.instances).toHaveLength(1)
    act(() => first.progress(50, 100))
    expect(await screen.findByText('17%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '17')
    const live = screen.getByText('3 枚中 1 枚目を送信中…')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live.textContent).not.toMatch(/%/)
    expect(statusesOnScreen()).toEqual(['sending', 'waiting', 'waiting'])
    expect(screen.getByText('送信中')).toBeInTheDocument()
    expect(screen.getAllByText('送信待ち')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '1 枚目の写真を外す' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '写真を選ぶ' })).toBeDisabled()

    act(() => first.respond(201, ok))
    const second = await xhrAt(2)
    expect(FakeXhr.instances).toHaveLength(2)
    expect(await screen.findByText('3 枚中 2 枚目を送信中…')).toBeInTheDocument()
    expect(statusesOnScreen()).toEqual(['sent', 'sending', 'waiting'])
    expect(screen.getByText('送信済み')).toBeInTheDocument()
    // 送れた分だけ、あとの残り枚数が減る
    expect(screen.getByText('あと 487 枚投稿できます')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
    act(() => second.progress(100, 100))
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67')
  })

  it('1 枚のときの進捗は今までどおり（送信中…・割合）', async () => {
    setup()
    await pick(jpeg())
    await userEvent.setup().click(await screen.findByRole('button', { name: '投稿する' }))
    const xhr = await xhrAt(1)
    act(() => xhr.progress(30, 100))
    expect(await screen.findByText('送信中…')).toBeInTheDocument()
    expect(screen.queryByText(/枚中/)).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30')
    expect(screen.queryByText('送信待ち')).not.toBeInTheDocument()
  })

  it('すべて送れたら、複数枚のトースト・note・重ねた台紙（3 枚まで）が出る', async () => {
    setup(12)
    const user = userEvent.setup()
    await pickMany(jpegs(4))
    await user.click(await screen.findByRole('button', { name: '4 枚を投稿する' }))
    for (let n = 1; n <= 4; n++) await respondAt(n, 201, ok)

    expect(await screen.findByText('4 枚の写真を投稿しました')).toBeInTheDocument()
    expect(screen.getByText('4 枚の写真をアルバムに届けました')).toBeInTheDocument()
    const pile = document.querySelector('.mount-pile')
    expect(pile?.querySelectorAll('figure.mount-print')).toHaveLength(3)
    expect(pile?.querySelectorAll('.kotobuki-seal')).toHaveLength(1)
    expect(screen.getByAltText('選んだ写真 2 枚目')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'アルバムを見る' })).toBeInTheDocument()

    // 重ねに使わない 1 枚の URL は手放している。続けて投稿すると残りも手放す
    expect(URL.revokeObjectURL).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '続けて投稿する' }))
    expect(await screen.findByText('あと 484 枚投稿できます')).toBeInTheDocument()
    expect(document.querySelector('.mount-pile')).toBeNull()
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.length).toBe(
      vi.mocked(URL.createObjectURL).mock.calls.length,
    )
  })

  it('一部が失敗したら送れた分は投稿したまま、失敗した写真だけを縮小し直さず再送できる', async () => {
    setup(12)
    const user = userEvent.setup()
    await pickMany(jpegs(4))
    await user.click(await screen.findByRole('button', { name: '4 枚を投稿する' }))
    await respondAt(1, 201, ok)
    const second = await xhrAt(2)
    act(() => second.fail())
    // 失敗が続くと残りを送らない（D-42）ので、失敗の間に成功をはさむ
    await respondAt(3, 201, ok)
    const fourth = await xhrAt(4)
    act(() => fourth.fail())

    expect(await screen.findByText('2 枚の写真を投稿しました')).toBeInTheDocument()
    expect(await screen.findByText('2 枚を送信できませんでした')).toBeInTheDocument()
    expect(screen.getByText('2 枚を選んでいます')).toBeInTheDocument()
    expect(screen.getByText('あと 486 枚投稿できます')).toBeInTheDocument()
    expect(statusesOnScreen()).toEqual(['failed', 'failed'])
    expect(screen.getAllByText('送信失敗')).toHaveLength(2)
    expect(screen.queryByText('寿')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'もう一度送る' }))
    await respondAt(5, 201, ok)
    await respondAt(6, 201, ok)
    expect(FakeXhr.instances).toHaveLength(6)
    expect(createResizedImages).toHaveBeenCalledTimes(4)
    // 最終的に全部送れたので、このまとまりで送った合計で完了になる
    expect(await screen.findByText('4 枚の写真をアルバムに届けました')).toBeInTheDocument()
  })

  it('失敗が 1 枚だけなら単数の文言で、再送で完了する', async () => {
    setup()
    const user = userEvent.setup()
    await pickMany(jpegs(2))
    await user.click(await screen.findByRole('button', { name: '2 枚を投稿する' }))
    await respondAt(1, 201, ok)
    const second = await xhrAt(2)
    act(() => second.fail())
    expect(await screen.findByText('送信できませんでした')).toBeInTheDocument()
    expect(await screen.findByText('写真を投稿しました')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'もう一度送る' }))
    await respondAt(3, 201, ok)
    expect(await screen.findByText('2 枚の写真をアルバムに届けました')).toBeInTheDocument()
  })

  it('サーバーが形式・サイズで拒否した写真は一覧から外し、理由を出して次へ進む', async () => {
    setup()
    const user = userEvent.setup()
    await pickMany(jpegs(3))
    await user.click(await screen.findByRole('button', { name: '3 枚を投稿する' }))
    await respondAt(1, 201, ok)
    await respondAt(2, 413, { error: { code: 'FILE_TOO_LARGE', message: 'x' } })
    await respondAt(3, 201, ok)
    expect(await screen.findByText('写真のサイズが大きすぎます（10MB まで）')).toBeInTheDocument()
    expect(await screen.findByText('2 枚の写真をアルバムに届けました')).toBeInTheDocument()
  })

  it('途中で投稿の上限に達したら、残りは送らず、上限の表示にする', async () => {
    setup(498)
    const user = userEvent.setup()
    await pickMany(jpegs(2))
    await user.click(await screen.findByRole('button', { name: '2 枚を投稿する' }))
    await respondAt(1, 201, ok)
    await respondAt(2, 409, { error: { code: 'UPLOAD_LIMIT_REACHED', message: 'x' } })
    expect(await screen.findByText('投稿できる枚数（500 枚）に達しました')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '写真を選ぶ' })).toBeDisabled()
    expect(itemElements()).toHaveLength(0)
    expect(FakeXhr.instances).toHaveLength(2)
  })

  it('途中で認証が切れたら、残りは送らず /error へ移動する', async () => {
    setup()
    const user = userEvent.setup()
    await pickMany(jpegs(3))
    await user.click(await screen.findByRole('button', { name: '3 枚を投稿する' }))
    await respondAt(1, 201, ok)
    await respondAt(2, 401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })
    expect(
      await screen.findByText('受付でお渡しした QR コードを読み取ってください'),
    ).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(FakeXhr.instances).toHaveLength(2)
  })

  it('複数枚の送信中だけ、画面を離れるときに警告する', async () => {
    setup()
    await pickMany(jpegs(2))
    const before = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(before)
    expect(before.defaultPrevented).toBe(false)
    await userEvent.setup().click(await screen.findByRole('button', { name: '2 枚を投稿する' }))
    await xhrAt(1)
    const during = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(during)
    expect(during.defaultPrevented).toBe(true)
  })

  it('画面を離れたら送信を中断し、以降の写真は送らない', async () => {
    mockFetch({ ...config, 'GET /api/t/t1/me': () => json(meWith(12)) })
    installFakeXhr()
    const view = renderApp('/t/t1/upload')
    await pickMany(jpegs(3))
    await userEvent.setup().click(await screen.findByRole('button', { name: '3 枚を投稿する' }))
    const first = await xhrAt(1)
    view.unmount()
    expect(first.aborted).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(FakeXhr.instances).toHaveLength(1)
    // 手放していない URL は残さない
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.length).toBe(
      vi.mocked(URL.createObjectURL).mock.calls.length,
    )
  })

  it('写真ごとに違う投稿キーが付き、「もう一度送る」では同じキーで再送する', async () => {
    setup()
    const user = userEvent.setup()
    await pickMany(jpegs(2))
    await user.click(await screen.findByRole('button', { name: '2 枚を投稿する' }))
    act(() => FakeXhr.instances[0]?.fail())
    const second = await xhrAt(2)
    act(() => second.fail())
    await user.click(await screen.findByRole('button', { name: 'もう一度送る' }))
    await respondAt(3, 201, ok)
    await xhrAt(4)
    const [k1, k2] = [keyOf(1), keyOf(2)]
    expect(k1).toBeTruthy()
    expect(k2).toBeTruthy()
    expect(k1).not.toBe(k2)
    expect(keyOf(3)).toBe(k1)
    expect(keyOf(4)).toBe(k2)
  })

  it('応答が返らない写真は 30 秒で「送信失敗」になり、次の写真へ進み、ボタンが戻る', async () => {
    setup()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await pickMany(jpegs(3))
    await user.click(await screen.findByRole('button', { name: '3 枚を投稿する' }))
    const first = await xhrAt(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    vi.useRealTimers()
    expect(first.aborted).toBe(true)
    const second = await xhrAt(2)
    act(() => second.respond(201, ok))
    await respondAt(3, 201, ok)
    expect(await screen.findByText('送信できませんでした')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'もう一度送る' })).toBeEnabled()
  })

  it('続けて 2 枚失敗したら残りは送らず、「もう一度送る」で全部を同じキーで送る', async () => {
    setup()
    const user = userEvent.setup()
    await pickMany(jpegs(4))
    await user.click(await screen.findByRole('button', { name: '4 枚を投稿する' }))
    act(() => FakeXhr.instances[0]?.fail())
    const second = await xhrAt(2)
    act(() => second.fail())
    expect(await screen.findByText('4 枚を送信できませんでした')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(FakeXhr.instances).toHaveLength(2)
    expect(statusesOnScreen()).toEqual(['failed', 'failed', 'failed', 'failed'])

    await user.click(screen.getByRole('button', { name: 'もう一度送る' }))
    for (const n of [3, 4, 5, 6]) await respondAt(n, 201, ok)
    expect(FakeXhr.instances).toHaveLength(6)
    for (const n of [1, 2]) expect(keyOf(n + 2)).toBe(keyOf(n))
    expect(keyOf(5)).toBeTruthy()
    expect(new Set([3, 4, 5, 6].map(keyOf)).size).toBe(4)
    expect(await screen.findByText('4 枚の写真をアルバムに届けました')).toBeInTheDocument()
  })

  it('失敗、成功、失敗は続けての失敗ではなく、最後の写真まで送る', async () => {
    setup()
    const user = userEvent.setup()
    await pickMany(jpegs(3))
    await user.click(await screen.findByRole('button', { name: '3 枚を投稿する' }))
    act(() => FakeXhr.instances[0]?.fail())
    await respondAt(2, 201, ok)
    const third = await xhrAt(3)
    act(() => third.fail())
    expect(await screen.findByText('2 枚を送信できませんでした')).toBeInTheDocument()
    expect(FakeXhr.instances).toHaveLength(3)
  })

  it('再送で 200 が返った写真も送信済みになり、残り枚数は 1 枚分だけ減る', async () => {
    setup(12)
    const user = userEvent.setup()
    await pick(jpeg())
    await user.click(await screen.findByRole('button', { name: '投稿する' }))
    act(() => FakeXhr.instances[0]?.fail())
    await user.click(await screen.findByRole('button', { name: 'もう一度送る' }))
    await respondAt(2, 200, ok)
    expect(await screen.findByText('写真をアルバムに届けました')).toBeInTheDocument()
    expect(keyOf(2)).toBe(keyOf(1))
    await user.click(screen.getByRole('button', { name: '続けて投稿する' }))
    expect(screen.getByText('あと 487 枚投稿できます')).toBeInTheDocument()
  })
})
