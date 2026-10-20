import { describe, expect, it } from 'vitest'
import { NICKNAME_MAX_LENGTH } from './limits'
import { countNicknameChars, nicknameKey, normalizeNickname, validateNickname } from './nickname'

describe('normalizeNickname', () => {
  it('前後の空白（全角スペース・タブ・改行を含む）を除く', () => {
    expect(normalizeNickname('  たろう  ')).toBe('たろう')
    expect(normalizeNickname('　たろう　')).toBe('たろう')
    expect(normalizeNickname(' \t\nたろう\n')).toBe('たろう')
  })

  it('途中の空白は残す', () => {
    expect(normalizeNickname(' たろう 花子 ')).toBe('たろう 花子')
  })
})

describe('nicknameKey', () => {
  it('正規化後の値になる', () => {
    expect(nicknameKey('　たろう ')).toBe('たろう')
    expect(nicknameKey('Taro')).not.toBe(nicknameKey('taro')) // 仮置き: 大文字小文字は区別する
  })
})

describe('countNicknameChars', () => {
  it('書記素クラスタ単位で数える', () => {
    expect(countNicknameChars('')).toBe(0)
    expect(countNicknameChars('たろう')).toBe(3)
    expect(countNicknameChars('abc')).toBe(3)
    expect(countNicknameChars('😀')).toBe(1) // サロゲートペア
    expect(countNicknameChars('👨‍👩‍👧‍👦')).toBe(1) // ZWJ で結合した絵文字
    expect(countNicknameChars('👍🏽')).toBe(1) // 肌の色
    expect(countNicknameChars('🇯🇵')).toBe(1) // 国旗
    expect(countNicknameChars('が')).toBe(1) // 結合文字（濁点）
    expect(countNicknameChars('a😀b')).toBe(3)
  })
})

describe('validateNickname', () => {
  it('正規化した値を返す', () => {
    expect(validateNickname('　たろう ')).toEqual({ ok: true, value: 'たろう' })
  })

  it('空・空白だけは REQUIRED', () => {
    expect(validateNickname('')).toEqual({ ok: false, field: 'REQUIRED' })
    expect(validateNickname(' 　 ')).toEqual({ ok: false, field: 'REQUIRED' })
  })

  it('20 文字は通り、21 文字は TOO_LONG', () => {
    expect(validateNickname('あ'.repeat(NICKNAME_MAX_LENGTH)).ok).toBe(true)
    expect(validateNickname('あ'.repeat(NICKNAME_MAX_LENGTH + 1))).toEqual({
      ok: false,
      field: 'TOO_LONG',
    })
  })

  it('絵文字は結合しても 1 文字として数える', () => {
    expect(validateNickname('👨‍👩‍👧‍👦'.repeat(20)).ok).toBe(true)
    expect(validateNickname('👨‍👩‍👧‍👦'.repeat(21)).ok).toBe(false)
  })

  it('前後の空白は文字数に含めない', () => {
    expect(validateNickname(`　${'あ'.repeat(20)}　`).ok).toBe(true)
  })
})
