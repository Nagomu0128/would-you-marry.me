import { render } from '@testing-library/react'
import type { AdminTenant, TenantBoundaries } from '@wym/shared'
import { MotionProvider, ToastProvider } from '@wym/ui'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { App } from './App'

export type Handler = (call: {
  method: string
  body: unknown
  raw: BodyInit | null | undefined
}) => { status?: number; json?: unknown } | undefined

export type Calls = { method: string; path: string; body: unknown }[]

/** fetch をモックする。`"METHOD /path"` をキーにしたハンドラーで応答を返す */
export function mockFetch(routes: Record<string, Handler>) {
  const calls: Calls = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    const method = init?.method ?? 'GET'
    let body: unknown
    if (typeof init?.body === 'string') body = JSON.parse(init.body)
    calls.push({ method, path, body })
    const handler = routes[`${method} ${path}`]
    if (!handler) {
      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'x' } }), {
        status: 404,
      })
    }
    const out = handler({ method, body, raw: init?.body }) ?? {}
    const status = out.status ?? 200
    if (status === 204) return new Response(null, { status })
    return new Response(JSON.stringify(out.json ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fn)
  return { calls, fn }
}

export function error(status: number, code: string, extra: object = {}) {
  return { status, json: { error: { code, message: 'x', ...extra } } }
}

export function renderApp(path: string) {
  return render(
    <MotionProvider>
      <ToastProvider bottom="none">
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </ToastProvider>
    </MotionProvider>,
  )
}

export const ME = { json: { email: 'a@example.com', name: 'A' } }

export const TENANT_ID = '12345678-aaaa-bbbb-cccc-1234567890ab'

export function tenant(overrides: Partial<AdminTenant> = {}): AdminTenant {
  return {
    id: TENANT_ID,
    name: '山田家・佐藤家 結婚式',
    eventDate: '2026-10-31',
    phase: 'joining',
    suspended: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    dataDeletedAt: null,
    stats: { guestCount: 52, photoCount: 830, likeCount: 2140, storageBytes: 3.2 * 1024 ** 3 },
    ...overrides,
  }
}

export const BOUNDARIES: TenantBoundaries = {
  joiningStart: '2026-10-30T15:00:00.000Z',
  viewingStart: '2026-11-01T15:00:00.000Z',
  coupleOnlyStart: '2027-01-31T15:00:00.000Z',
  deletionAt: '2027-04-30T15:00:00.000Z',
}
