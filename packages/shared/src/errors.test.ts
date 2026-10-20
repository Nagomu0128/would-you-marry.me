import { describe, expect, it } from 'vitest'
import {
  ApiError,
  createErrorBody,
  createErrorResponse,
  ERROR_CODES,
  ERROR_STATUS,
  errorStatus,
  isErrorCode,
} from './errors'

// docs/spec/api.md のエラー一覧と同じ内容
const SPEC: Record<string, number> = {
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
}

describe('エラーコード', () => {
  it('api.md の一覧と過不足なく一致する', () => {
    expect({ ...ERROR_STATUS }).toEqual(SPEC)
    expect(ERROR_CODES).toHaveLength(21)
  })

  it('コードから HTTP ステータスを引ける', () => {
    expect(errorStatus('NICKNAME_TAKEN')).toBe(409)
    expect(errorStatus('PASSCODE_LOCKED')).toBe(429)
  })

  it('isErrorCode は定義済みのコードだけを通す', () => {
    expect(isErrorCode('NOT_FOUND')).toBe(true)
    expect(isErrorCode('toString')).toBe(false)
    expect(isErrorCode('UNKNOWN')).toBe(false)
    expect(isErrorCode(404)).toBe(false)
  })
})

describe('エラー本文の生成', () => {
  it('code と message だけの本文を作る', () => {
    expect(createErrorBody('NICKNAME_TAKEN', 'nickname already in use')).toEqual({
      error: { code: 'NICKNAME_TAKEN', message: 'nickname already in use' },
    })
  })

  it('fields と追加情報を含められる', () => {
    expect(
      createErrorBody('VALIDATION_ERROR', 'invalid', { fields: { nickname: 'TOO_LONG' } }),
    ).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'invalid', fields: { nickname: 'TOO_LONG' } },
    })
    expect(createErrorBody('PASSCODE_INVALID', 'wrong', { remainingAttempts: 4 }).error).toEqual({
      code: 'PASSCODE_INVALID',
      message: 'wrong',
      remainingAttempts: 4,
    })
    expect(createErrorBody('PASSCODE_LOCKED', 'locked', { retryAfterSeconds: 900 }).error).toEqual({
      code: 'PASSCODE_LOCKED',
      message: 'locked',
      retryAfterSeconds: 900,
    })
  })

  it('指定しなかった項目はキーごと含めない', () => {
    const { error } = createErrorBody('NOT_FOUND', 'not found', {})
    expect(Object.keys(error)).toEqual(['code', 'message'])
  })

  it('createErrorResponse はステータスと本文を返す', () => {
    const res = createErrorResponse('FILE_TOO_LARGE', 'too large')
    expect(res.status).toBe(413)
    expect(res.body.error.code).toBe('FILE_TOO_LARGE')
  })

  it('ApiError は本文とステータスに変換できる', () => {
    const err = new ApiError('TENANT_SUSPENDED', 'suspended')
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(403)
    expect(err.toBody()).toEqual({ error: { code: 'TENANT_SUSPENDED', message: 'suspended' } })
  })
})
