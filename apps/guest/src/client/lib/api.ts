// fetch の薄いラッパーと、参加者向け API の関数（docs/spec/api.md）。
// 同一オリジン・JSON。エラー本文は ApiClientError、通信失敗は NetworkError にする。
// 新しい API を足すときは、下の「参加者向け API」に関数を 1 つ足す（型は @wym/shared の api-types）。

import {
  type ApiErrorDetail,
  type ConfigResponse,
  type CourseMenuResponse,
  type ErrorCode,
  type GuestMeResponse,
  type GuestPhotoListResponse,
  type GuestPhotosQuery,
  type GuestRankingResponse,
  isErrorCode,
  type LikeResponse,
  type PutNicknameRequest,
} from '@wym/shared'

/** API が返したエラー（`{ error: { code, message, ... } }`） */
export class ApiClientError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly detail: ApiErrorDetail

  constructor(code: ErrorCode, status: number, detail: ApiErrorDetail) {
    super(detail.message)
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
    this.detail = detail
  }
}

/** 通信できなかった（電波がない、サーバーに届かないなど） */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('network error', { cause })
    this.name = 'NetworkError'
  }
}

async function toApiError(response: Response): Promise<ApiClientError> {
  let detail: ApiErrorDetail = { code: 'INTERNAL_ERROR', message: `HTTP ${response.status}` }
  try {
    const body: unknown = await response.json()
    const error = (body as { error?: Partial<ApiErrorDetail> } | null)?.error
    if (error && isErrorCode(error.code)) {
      detail = { ...error, code: error.code, message: error.message ?? error.code }
    }
  } catch {
    // 本文が JSON でないときは INTERNAL_ERROR として扱う
  }
  return new ApiClientError(detail.code, response.status, detail)
}

/** 生の Response を返す。通信失敗は NetworkError、ステータスが失敗なら ApiClientError を投げる */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init })
  } catch (error) {
    throw new NetworkError(error)
  }
  if (!response.ok) throw await toApiError(response)
  return response
}

/** JSON を返す API を呼ぶ。本文のない成功（204）は undefined */
export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const init: RequestInit = { method: options.method ?? 'GET', headers }
  if (options.signal) init.signal = options.signal
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }
  const response = await apiFetch(path, init)
  if (response.status === 204) return undefined as T
  try {
    return (await response.json()) as T
  } catch (error) {
    throw new NetworkError(error)
  }
}

/** `?cursor=…&limit=…` のようなクエリ文字列を作る（値のないものは省く） */
export function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

// --- 共通 ---

export function getConfig(): Promise<ConfigResponse> {
  return apiRequest<ConfigResponse>('/api/config')
}

// --- 参加者向け API（`/api/t/:tenantId`） ---

const base = (tenantId: string) => `/api/t/${encodeURIComponent(tenantId)}`

export function getMe(tenantId: string): Promise<GuestMeResponse> {
  return apiRequest<GuestMeResponse>(`${base(tenantId)}/me`)
}

export function putNickname(tenantId: string, body: PutNicknameRequest): Promise<GuestMeResponse> {
  return apiRequest<GuestMeResponse>(`${base(tenantId)}/me/nickname`, { method: 'PUT', body })
}

export function getPhotos(
  tenantId: string,
  query: GuestPhotosQuery = {},
): Promise<GuestPhotoListResponse> {
  return apiRequest<GuestPhotoListResponse>(`${base(tenantId)}/photos${buildQuery(query)}`)
}

export function getRanking(tenantId: string): Promise<GuestRankingResponse> {
  return apiRequest<GuestRankingResponse>(`${base(tenantId)}/photos/ranking`)
}

export function likePhoto(tenantId: string, photoId: string): Promise<LikeResponse> {
  return apiRequest<LikeResponse>(`${base(tenantId)}/photos/${encodeURIComponent(photoId)}/like`, {
    method: 'PUT',
  })
}

export function unlikePhoto(tenantId: string, photoId: string): Promise<LikeResponse> {
  return apiRequest<LikeResponse>(`${base(tenantId)}/photos/${encodeURIComponent(photoId)}/like`, {
    method: 'DELETE',
  })
}

export function deletePhoto(tenantId: string, photoId: string): Promise<void> {
  return apiRequest<void>(`${base(tenantId)}/photos/${encodeURIComponent(photoId)}`, {
    method: 'DELETE',
  })
}

export function getCourseMenu(tenantId: string): Promise<CourseMenuResponse> {
  return apiRequest<CourseMenuResponse>(`${base(tenantId)}/course-menu`)
}

/**
 * 席次表 PDF を取得して、表示用の Blob URL を返す。未登録（NOT_FOUND）なら null。
 * 返した URL は使い終わったら URL.revokeObjectURL で解放する。
 */
export async function fetchSeatingChartUrl(tenantId: string): Promise<string | null> {
  try {
    const response = await apiFetch(`${base(tenantId)}/seating-chart`)
    return URL.createObjectURL(await response.blob())
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'NOT_FOUND') return null
    throw error
  }
}
