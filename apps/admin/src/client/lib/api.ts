import type {
  AddCourseMenuImageResponse,
  AdminGuestListResponse,
  AdminMeResponse,
  AdminPhotoListResponse,
  AdminTenantDetailResponse,
  AdminTenantListResponse,
  AdminTenantResponse,
  CoupleAccessResponse,
  CourseMenuResponse,
  CreateTenantRequest,
  ErrorCode,
  ErrorFields,
  IssueCoupleAccessResponse,
  JoinUrlResponse,
  SeatingChartResponse,
  UpdateGuestRequest,
  UpdateTenantRequest,
} from '@wym/shared'
import { isErrorCode } from '@wym/shared'

/** 通信できなかった（fetch が失敗した）ときは 'NETWORK' */
export type ClientErrorCode = ErrorCode | 'NETWORK'

type ErrorExtra = { fields?: ErrorFields; remainingAttempts?: number; retryAfterSeconds?: number }

export class ApiClientError extends Error {
  readonly status: number
  readonly code: ClientErrorCode
  readonly fields?: ErrorFields
  readonly remainingAttempts?: number
  readonly retryAfterSeconds?: number

  constructor(status: number, code: ClientErrorCode, message: string, extra: ErrorExtra = {}) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.fields = extra.fields
    this.remainingAttempts = extra.remainingAttempts
    this.retryAfterSeconds = extra.retryAfterSeconds
  }
}

// セッション切れ（401）のとき、ログイン画面へ移動するための窓口。AuthGate が設定する
let unauthenticatedHandler: (() => void) | null = null
export function setUnauthenticatedHandler(handler: (() => void) | null) {
  unauthenticatedHandler = handler
}

type RequestOptions = {
  json?: unknown
  body?: BodyInit
  headers?: Record<string, string>
  /** 401 でログイン画面へ移動しない（`/api/me` の判定用） */
  skipUnauthenticatedHandler?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function toError(res: Response): Promise<ApiClientError> {
  let code: ClientErrorCode = 'INTERNAL_ERROR'
  let message = res.statusText
  let extra: ErrorExtra = {}
  try {
    const body: unknown = await res.json()
    const detail = isRecord(body) ? body.error : undefined
    if (isRecord(detail)) {
      if (isErrorCode(detail.code)) code = detail.code
      if (typeof detail.message === 'string') message = detail.message
      extra = {
        fields: isRecord(detail.fields) ? (detail.fields as ErrorFields) : undefined,
        remainingAttempts:
          typeof detail.remainingAttempts === 'number' ? detail.remainingAttempts : undefined,
        retryAfterSeconds:
          typeof detail.retryAfterSeconds === 'number' ? detail.retryAfterSeconds : undefined,
      }
    }
  } catch {
    // JSON でない応答は INTERNAL_ERROR として扱う
  }
  return new ApiClientError(res.status, code, message, extra)
}

export async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { ...options.headers }
  let body: BodyInit | undefined = options.body
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.json)
  }

  let res: Response
  try {
    // 同一オリジンの fetch。状態を変えるリクエストにはブラウザが Origin を付ける
    res = await fetch(path, { method, headers, body, credentials: 'same-origin' })
  } catch {
    throw new ApiClientError(0, 'NETWORK', 'network error')
  }

  if (!res.ok) {
    const error = await toError(res)
    if (error.code === 'UNAUTHENTICATED' && !options.skipUnauthenticatedHandler) {
      unauthenticatedHandler?.()
    }
    throw error
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const tenantPath = (tenantId: string) => `/api/tenants/${encodeURIComponent(tenantId)}`

export function seatingChartUrl(tenantId: string): string {
  return `${tenantPath(tenantId)}/seating-chart`
}

export const api = {
  me: () => request<AdminMeResponse>('GET', '/api/me', { skipUnauthenticatedHandler: true }),

  listTenants: () => request<AdminTenantListResponse>('GET', '/api/tenants'),
  createTenant: (body: CreateTenantRequest) =>
    request<AdminTenantResponse>('POST', '/api/tenants', { json: body }),
  getTenant: (tenantId: string) => request<AdminTenantDetailResponse>('GET', tenantPath(tenantId)),
  updateTenant: (tenantId: string, body: UpdateTenantRequest) =>
    request<AdminTenantResponse>('PATCH', tenantPath(tenantId), { json: body }),
  deleteTenant: (tenantId: string, confirmName: string) =>
    request<void>('POST', `${tenantPath(tenantId)}/deletion`, { json: { confirmName } }),

  /** 席次表 PDF が登録済みか（PDF そのものを返す API なので、応答の本文は読まずに捨てる） */
  async hasSeatingChart(tenantId: string): Promise<boolean> {
    let res: Response
    try {
      res = await fetch(seatingChartUrl(tenantId), { credentials: 'same-origin' })
    } catch {
      throw new ApiClientError(0, 'NETWORK', 'network error')
    }
    if (res.ok) {
      void res.body?.cancel()
      return true
    }
    if (res.status === 404) return false
    throw await toError(res)
  },
  /** PDF そのものを本文で送る */
  putSeatingChart: (tenantId: string, file: Blob) =>
    request<SeatingChartResponse>('PUT', seatingChartUrl(tenantId), {
      body: file,
      headers: { 'Content-Type': 'application/pdf' },
    }),

  getCourseMenu: (tenantId: string) =>
    request<CourseMenuResponse>('GET', `${tenantPath(tenantId)}/course-menu`),
  addCourseMenuImage: (tenantId: string, file: Blob) => {
    const form = new FormData()
    form.append('file', file)
    return request<AddCourseMenuImageResponse>(
      'POST',
      `${tenantPath(tenantId)}/course-menu/images`,
      { body: form },
    )
  },
  deleteCourseMenuImage: (tenantId: string, imageId: string) =>
    request<void>(
      'DELETE',
      `${tenantPath(tenantId)}/course-menu/images/${encodeURIComponent(imageId)}`,
    ),
  reorderCourseMenu: (tenantId: string, imageIds: string[]) =>
    request<void>('PUT', `${tenantPath(tenantId)}/course-menu/order`, { json: { imageIds } }),

  getJoinUrl: (tenantId: string) =>
    request<JoinUrlResponse>('GET', `${tenantPath(tenantId)}/join-url`),
  issueJoinUrl: (tenantId: string) =>
    request<JoinUrlResponse>('POST', `${tenantPath(tenantId)}/join-url`),
  getCoupleAccess: (tenantId: string) =>
    request<CoupleAccessResponse>('GET', `${tenantPath(tenantId)}/couple-access`),
  issueCoupleAccess: (tenantId: string) =>
    request<IssueCoupleAccessResponse>('POST', `${tenantPath(tenantId)}/couple-access`),

  /** 写真の一覧（新しい順）。続きは前の応答の `nextCursor` を `cursor` に渡す。一覧用画像の URL は `urls.thumb` */
  listPhotos: (tenantId: string, options: { limit?: number; cursor?: string } = {}) => {
    const query = new URLSearchParams()
    if (options.limit !== undefined) query.set('limit', String(options.limit))
    if (options.cursor !== undefined) query.set('cursor', options.cursor)
    const qs = query.toString()
    return request<AdminPhotoListResponse>(
      'GET',
      `${tenantPath(tenantId)}/photos${qs === '' ? '' : `?${qs}`}`,
    )
  },
  deletePhoto: (tenantId: string, photoId: string) =>
    request<void>('DELETE', `${tenantPath(tenantId)}/photos/${encodeURIComponent(photoId)}`),

  listGuests: (tenantId: string) =>
    request<AdminGuestListResponse>('GET', `${tenantPath(tenantId)}/guests`),
  updateGuest: (tenantId: string, guestId: string, body: UpdateGuestRequest) =>
    request<unknown>('PATCH', `${tenantPath(tenantId)}/guests/${encodeURIComponent(guestId)}`, {
      json: body,
    }),
}
