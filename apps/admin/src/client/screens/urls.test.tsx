import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOUNDARIES, ME, mockFetch, renderApp, TENANT_ID } from '../test-utils'

const { create, downloadBlob, renderQrPng } = vi.hoisted(() => ({
  create: vi.fn(() => ({ modules: { size: 21, data: new Uint8Array(21 * 21).fill(1) } })),
  downloadBlob: vi.fn(),
  renderQrPng: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
}))
vi.mock('qrcode', () => ({ default: { create } }))
vi.mock('../lib/qr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/qr')>()),
  downloadBlob,
  renderQrPng,
}))
vi.mock('../lib/auth', () => ({
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  authClient: {},
}))

const BASE = `/api/tenants/${TENANT_ID}`
const JOIN_URL = `https://would-you-marry.me/join/${TENANT_ID}?t=tok`
const COUPLE_URL = `https://would-you-marry.me/couple/${TENANT_ID}?t=ctok`
const joinIssued = {
  url: JOIN_URL,
  issuedAt: '2026-10-20T00:00:00.000Z',
  joiningStart: BOUNDARIES.joiningStart,
  joiningEnd: BOUNDARIES.viewingStart,
}

beforeEach(() => {
  create.mockClear()
  downloadBlob.mockClear()
  renderQrPng.mockClear()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => undefined) },
    configurable: true,
  })
})

describe('URL の発行（SA-05）', () => {
  it('未発行なら発行ボタンを出し、発行すると QR コードと期間を表示する', async () => {
    const { calls } = mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/join-url`]: () => ({ json: { url: null } }),
      [`GET ${BASE}/couple-access`]: () => ({ json: { url: null } }),
      [`POST ${BASE}/join-url`]: () => ({ json: joinIssued }),
    })
    renderApp(`/tenants/${TENANT_ID}/urls`)
    const card = (await screen.findByText('参加 URL（QR コード）')).closest('div') as HTMLElement
    expect(screen.queryByRole('img', { name: '参加 URL の QR コード' })).not.toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: '発行' }))
    expect(await screen.findByRole('img', { name: '参加 URL の QR コード' })).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/join-url'))).toBe(true)
    expect(screen.getByText('参加できる期間: 10/31 0:00 〜 11/1 23:59')).toBeInTheDocument()
    expect(screen.getByText(JOIN_URL)).toBeInTheDocument()
    // 確認ダイアログなしで発行する（初回）
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('qrcode を誤り訂正レベル M 以上で呼ぶ', async () => {
    mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/join-url`]: () => ({ json: joinIssued }),
      [`GET ${BASE}/couple-access`]: () => ({ json: { url: null } }),
    })
    renderApp(`/tenants/${TENANT_ID}/urls`)
    await screen.findByRole('img', { name: '参加 URL の QR コード' })
    expect(create).toHaveBeenCalledWith(JOIN_URL, { errorCorrectionLevel: 'Q' })
  })

  it('QR コードを保存すると、テナント名を含まないファイル名で 1,024px の PNG を作る', async () => {
    mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/join-url`]: () => ({ json: joinIssued }),
      [`GET ${BASE}/couple-access`]: () => ({ json: { url: null } }),
    })
    renderApp(`/tenants/${TENANT_ID}/urls`)
    await userEvent.click(await screen.findByRole('button', { name: 'QR コードを保存' }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled())
    expect(renderQrPng).toHaveBeenCalledTimes(1)
    expect(downloadBlob.mock.calls[0]?.[1]).toBe('join-qr-12345678.png')
  })

  it('参加 URL の再発行は確認ダイアログを出してから送る', async () => {
    const { calls } = mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/join-url`]: () => ({ json: joinIssued }),
      [`GET ${BASE}/couple-access`]: () => ({ json: { url: null } }),
      [`POST ${BASE}/join-url`]: () => ({
        json: { ...joinIssued, url: `${JOIN_URL}2` },
      }),
    })
    renderApp(`/tenants/${TENANT_ID}/urls`)
    await userEvent.click(await screen.findByRole('button', { name: '再発行' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('参加 URL を再発行しますか？')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    await userEvent.click(within(dialog).getByRole('button', { name: '再発行する' }))
    expect(await screen.findByText(`${JOIN_URL}2`)).toBeInTheDocument()
  })

  it('URL をコピーするとトーストを出す', async () => {
    mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/join-url`]: () => ({ json: joinIssued }),
      [`GET ${BASE}/couple-access`]: () => ({ json: { url: null } }),
    })
    renderApp(`/tenants/${TENANT_ID}/urls`)
    await userEvent.click(
      (await screen.findAllByRole('button', { name: 'コピー' }))[0] as HTMLElement,
    )
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JOIN_URL)
    expect(await screen.findByText('コピーしました')).toBeInTheDocument()
  })

  it('新郎新婦用 URL: 発行直後だけパスコードと注意文を出し、画面を開き直すと出ない', async () => {
    mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/join-url`]: () => ({ json: { url: null } }),
      [`GET ${BASE}/couple-access`]: () => ({ json: { url: null } }),
      [`POST ${BASE}/couple-access`]: () => ({
        json: { url: COUPLE_URL, passcode: 'AB12CD34', issuedAt: '2026-10-20T00:00:00.000Z' },
      }),
    })
    const first = renderApp(`/tenants/${TENANT_ID}/urls`)
    const section = (await screen.findByText('新郎新婦用 URL')).closest('div') as HTMLElement
    expect(screen.queryByText('AB12CD34')).not.toBeInTheDocument()
    await userEvent.click(within(section).getByRole('button', { name: '発行' }))
    expect(await screen.findByText('AB12CD34')).toBeInTheDocument()
    expect(screen.getByText(/パスコードはこの画面を離れると再表示できません/)).toBeInTheDocument()
    expect(screen.getByText(COUPLE_URL)).toBeInTheDocument()
    first.unmount()

    // 開き直すと GET は URL だけを返す
    mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/join-url`]: () => ({ json: { url: null } }),
      [`GET ${BASE}/couple-access`]: () => ({
        json: { url: COUPLE_URL, issuedAt: '2026-10-20T00:00:00.000Z', termsAgreedAt: null },
      }),
    })
    renderApp(`/tenants/${TENANT_ID}/urls`)
    expect(await screen.findByText(COUPLE_URL)).toBeInTheDocument()
    expect(screen.queryByText('AB12CD34')).not.toBeInTheDocument()
    expect(screen.queryByText(/再表示できません/)).not.toBeInTheDocument()
    expect(screen.getByText('規約は未同意')).toBeInTheDocument()
  })

  it('新郎新婦用 URL の再発行は確認ダイアログを出し、同意済みの表示もする', async () => {
    const { calls } = mockFetch({
      'GET /api/me': () => ME,
      [`GET ${BASE}/join-url`]: () => ({ json: { url: null } }),
      [`GET ${BASE}/couple-access`]: () => ({
        json: {
          url: COUPLE_URL,
          issuedAt: '2026-10-20T00:00:00.000Z',
          termsAgreedAt: '2026-10-21T00:00:00.000Z',
        },
      }),
      [`POST ${BASE}/couple-access`]: () => ({
        json: { url: `${COUPLE_URL}2`, passcode: 'ZZ99YY88', issuedAt: '2026-10-22T00:00:00.000Z' },
      }),
    })
    renderApp(`/tenants/${TENANT_ID}/urls`)
    expect(await screen.findByText('規約に同意済み')).toBeInTheDocument()
    const section = screen.getByText('新郎新婦用 URL').closest('div') as HTMLElement
    await userEvent.click(within(section).getByRole('button', { name: '再発行' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('新郎新婦用 URL とパスコードを再発行しますか？')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
    await userEvent.click(within(dialog).getByRole('button', { name: '再発行する' }))
    expect(await screen.findByText('ZZ99YY88')).toBeInTheDocument()
    expect(screen.getByText('規約は未同意')).toBeInTheDocument()
  })
})
