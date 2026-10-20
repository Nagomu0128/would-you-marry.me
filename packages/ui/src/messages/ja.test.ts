import { ERROR_CODES, type ErrorCode } from '@wym/shared'
import { describe, expect, it } from 'vitest'
import { errorMessage, format, ja } from './ja'

const NO_MESSAGE: ErrorCode[] = ['NICKNAME_REQUIRED', 'VALIDATION_ERROR']

describe('errorMessage', () => {
  it('文言を出さないコード以外のすべてのエラーコードに、両方の向きで文言がある', () => {
    for (const code of ERROR_CODES) {
      for (const audience of ['guest', 'couple'] as const) {
        const text = errorMessage(code, audience, { remainingAttempts: 2, minutes: 5 })
        if (NO_MESSAGE.includes(code)) {
          expect(text, `${code}/${audience}`).toBeNull()
        } else {
          expect(text, `${code}/${audience}`).toBeTypeOf('string')
          expect(text, `${code}/${audience}`).not.toBe('')
        }
      }
    }
  })

  it('参加者向けと新郎新婦向けで文言が分かれるコードを引き分ける', () => {
    expect(errorMessage('UNAUTHENTICATED', 'guest')).toBe(
      '受付でお渡しした QR コードを読み取ってください',
    )
    expect(errorMessage('UNAUTHENTICATED', 'couple')).toBe(
      '管理者からお知らせした URL を開いてください',
    )
    expect(errorMessage('PERIOD_ENDED', 'guest')).toBe(
      '公開期間が終了しました。ご参加ありがとうございました',
    )
    expect(errorMessage('PERIOD_ENDED', 'couple')).toBe(
      '公開期間が終了しました。ご利用ありがとうございました',
    )
  })

  it('同左のコードは両方の向きで同じ文言', () => {
    for (const code of [
      'TENANT_NOT_FOUND',
      'TENANT_SUSPENDED',
      'TERMS_NOT_AGREED',
      'FORBIDDEN',
      'NOT_FOUND',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
    ] as const) {
      expect(errorMessage(code, 'guest')).toBe(errorMessage(code, 'couple'))
    }
    expect(errorMessage('FORBIDDEN', 'guest')).toBe('この操作はできません')
  })

  it('パスコードのエラーに残り回数・待ち時間を差し込む', () => {
    expect(errorMessage('PASSCODE_INVALID', 'couple', { remainingAttempts: 3 })).toBe(
      'パスコードが違います（あと 3 回）',
    )
    expect(errorMessage('PASSCODE_LOCKED', 'couple', { minutes: 15 })).toBe(
      '入力できる回数を超えました。約 15 分後にお試しください',
    )
  })

  it('CONFIRMATION_MISMATCH は入力エラーの文言を返す', () => {
    expect(errorMessage('CONFIRMATION_MISMATCH', 'guest')).toBe('テナント名が一致しません')
  })
})

describe('差し込みのある文言', () => {
  it('format は {name} を差し込む', () => {
    expect(format('こんにちは、{nickname} さん', { nickname: 'たろう' })).toBe(
      'こんにちは、たろう さん',
    )
    expect(format('{a}{a}{b}', { a: 1, b: 'x' })).toBe('11x')
    expect(format('{missing}', {})).toBe('{missing}')
  })

  it('型のある関数で差し込める', () => {
    expect(ja.guest.home.greeting({ nickname: 'たろう' })).toBe('こんにちは、たろう さん')
    expect(ja.common.photoAlt({ nickname: 'たろう' })).toBe('たろう さんの写真')
    expect(ja.common.likeCount({ count: 12 })).toBe('いいね 12 件')
    expect(ja.guest.album.remaining({ remaining: 98 })).toBe('あと 98 枚投稿できます')
    expect(ja.guest.album.rank({ rank: 1 })).toBe('1 位')
    expect(ja.confirms.suspendTenant.body({ name: 'A家・B家' })).toBe(
      '「A家・B家」を停止しますか？参加者と新郎新婦は利用できなくなります',
    )
    expect(ja.admin.deletionDate({ date: '2027-04-01' })).toBe('データの削除予定日: 2027-04-01')
  })
})

describe('messages.md の文言', () => {
  it('共通・トースト・確認ダイアログの代表的な文言がある', () => {
    expect(ja.common.back).toBe('戻る')
    expect(ja.common.retry).toBe('もう一度試す')
    expect(ja.errors.network).toBe('通信できませんでした。電波の良い場所でもう一度お試しください')
    expect(ja.toasts.saveUnavailable).toBe(
      'この画面では保存できません。メニューから「ブラウザで開く」を選んでください',
    )
    expect(ja.confirms.deletePhotoGuest.confirm).toBe('削除する')
    expect(ja.confirms.reissueCoupleUrl.cancel).toBe('キャンセル')
    expect(Object.values(ja.admin.periodLabels)).toEqual([
      '準備中',
      '参加受付中',
      '閲覧期間',
      '新郎新婦のみ',
      '削除済み',
      '停止中',
    ])
  })
})
