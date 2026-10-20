// ニックネームのルール（docs/spec/api.md「PUT /me/nickname」）
// 画面の文字数カウンターとサーバーの検証で同じ関数を使う

import { NICKNAME_MAX_LENGTH } from './limits'

export type NicknameValidation =
  | { ok: true; value: string }
  | { ok: false; field: 'REQUIRED' | 'TOO_LONG' }

/** 前後の空白（全角スペースを含む）を除く */
export function normalizeNickname(input: string): string {
  return input.trim()
}

/** 重複判定用のキー（仮置き: 正規化後の値そのまま） */
export function nicknameKey(input: string): string {
  return normalizeNickname(input)
}

let segmenter: Intl.Segmenter | undefined

/** 文字数。書記素クラスタ単位で数える（結合した絵文字も 1 文字）。空白の除去はしない */
export function countNicknameChars(input: string): number {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  let count = 0
  for (const _ of segmenter.segment(input)) count++
  return count
}

/** 正規化して 1〜20 文字かを確認する */
export function validateNickname(input: string): NicknameValidation {
  const value = normalizeNickname(input)
  const count = countNicknameChars(value)
  if (count === 0) return { ok: false, field: 'REQUIRED' }
  if (count > NICKNAME_MAX_LENGTH) return { ok: false, field: 'TOO_LONG' }
  return { ok: true, value }
}
