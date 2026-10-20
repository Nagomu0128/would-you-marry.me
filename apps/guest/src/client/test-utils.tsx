import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { App } from './App'

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function apiError(code: string, status: number, extra: Record<string, unknown> = {}) {
  return json({ error: { code, message: code, ...extra } }, status)
}

/** fetch をモックする。キーは `GET /api/config` のような「メソッド パス（クエリなし）」 */
export function mockFetch(handlers: Record<string, Handler>) {
  const calls: { key: string; init: RequestInit | undefined }[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).split('?')[0]
    const key = `${init?.method ?? 'GET'} ${path}`
    calls.push({ key, init })
    const handler = handlers[key]
    if (!handler) return apiError('NOT_FOUND', 404)
    return handler(init)
  })
  vi.stubGlobal('fetch', fn)
  return { fn, calls }
}

export const config = { 'GET /api/config': () => json({ contactEmail: 'help@example.com' }) }

export function meResponse(nickname: string | null, termsAgreed = true) {
  return {
    tenant: { id: 't1', name: '〇〇家・△△家 結婚式', eventDate: '2026-10-31', phase: 'joining' },
    me: { id: 'g1', nickname, termsAgreed, photoCount: 0, photoLimit: 100 },
  }
}

export function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}
