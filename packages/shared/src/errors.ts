// API のエラーコード（docs/spec/api.md「共通の約束 > エラー」）

/** エラーコードと HTTP ステータスの対応 */
export const ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TENANT_NOT_FOUND: 404,
  TENANT_SUSPENDED: 403,
  OUTSIDE_JOINING_PERIOD: 403,
  PERIOD_ENDED: 403,
  JOIN_TOKEN_INVALID: 403,
  NICKNAME_REQUIRED: 403,
  NICKNAME_TAKEN: 409,
  TERMS_NOT_AGREED: 400,
  VALIDATION_ERROR: 400,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FILE_TYPE: 415,
  UPLOAD_LIMIT_REACHED: 409,
  COUPLE_LINK_INVALID: 403,
  PASSCODE_INVALID: 401,
  PASSCODE_LOCKED: 429,
  CONFIRMATION_MISMATCH: 400,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const

export type ErrorCode = keyof typeof ERROR_STATUS

export type ErrorStatus = (typeof ERROR_STATUS)[ErrorCode]

/** すべてのエラーコード */
export const ERROR_CODES = Object.keys(ERROR_STATUS) as ErrorCode[]

/** 項目ごとの入力エラー。例: `{ nickname: 'TOO_LONG' }` */
export type ErrorFields = Record<string, string>

/** `error` の中身。`remainingAttempts` と `retryAfterSeconds` はパスコードのエラーだけで返す */
export type ApiErrorDetail = {
  code: ErrorCode
  /** 開発用の英語メッセージ。画面には code をもとに messages の文言を出す */
  message: string
  fields?: ErrorFields
  remainingAttempts?: number
  retryAfterSeconds?: number
}

export type ApiErrorBody = { error: ApiErrorDetail }

export type ApiErrorOptions = {
  fields?: ErrorFields
  remainingAttempts?: number
  retryAfterSeconds?: number
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_STATUS, value)
}

export function errorStatus(code: ErrorCode): ErrorStatus {
  return ERROR_STATUS[code]
}

/** `{ error: { code, message, fields? } }` を作る。指定のない項目は含めない */
export function createErrorBody(
  code: ErrorCode,
  message: string,
  options: ApiErrorOptions = {},
): ApiErrorBody {
  const error: ApiErrorDetail = { code, message }
  if (options.fields !== undefined) error.fields = options.fields
  if (options.remainingAttempts !== undefined) error.remainingAttempts = options.remainingAttempts
  if (options.retryAfterSeconds !== undefined) error.retryAfterSeconds = options.retryAfterSeconds
  return { error }
}

/** Worker から Response を返すときのための、ステータス付きのエラー */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  options: ApiErrorOptions = {},
): { status: ErrorStatus; body: ApiErrorBody } {
  return { status: ERROR_STATUS[code], body: createErrorBody(code, message, options) }
}

/** 例外として投げられる API エラー。ハンドラーで エラー本文（toBody）に変換する */
export class ApiError extends Error {
  readonly code: ErrorCode
  readonly options: ApiErrorOptions

  constructor(code: ErrorCode, message: string, options: ApiErrorOptions = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.options = options
  }

  get status(): ErrorStatus {
    return ERROR_STATUS[this.code]
  }

  toBody(): ApiErrorBody {
    return createErrorBody(this.code, this.message, this.options)
  }
}
