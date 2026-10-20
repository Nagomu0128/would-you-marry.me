import { describe, expect, it } from 'vitest'
import { detectImageType, isPdf } from './image-type'

function ftyp(major: string, compatible: string[] = []): Uint8Array {
  const size = 16 + compatible.length * 4
  const out = new Uint8Array(size)
  new DataView(out.buffer).setUint32(0, size)
  const text = `ftyp${major}\0\0\0\0${compatible.join('')}`
  for (let i = 0; i < text.length; i++) out[4 + i] = text.charCodeAt(i)
  return out
}

describe('detectImageType', () => {
  it('JPEG・PNG を判定する', () => {
    expect(detectImageType(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe('jpeg')
    expect(detectImageType(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
      'png',
    )
  })

  it.each(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'])(
    'HEIC のブランド %s を判定する',
    (brand) => {
      expect(detectImageType(ftyp(brand))).toBe('heic')
    },
  )

  it('互換ブランドだけが heic でも HEIC と判定し、AVIF は含めない', () => {
    expect(detectImageType(ftyp('isom', ['heic']))).toBe('heic')
    expect(detectImageType(ftyp('mif1', ['avif', 'mif1']))).toBe('unknown')
    expect(detectImageType(ftyp('avif'))).toBe('unknown')
  })

  it('それ以外・短すぎる入力は unknown', () => {
    expect(detectImageType(new Uint8Array(0))).toBe('unknown')
    expect(detectImageType(Uint8Array.of(0xff, 0xd8))).toBe('unknown')
    expect(detectImageType(new TextEncoder().encode('GIF89a'))).toBe('unknown')
    expect(detectImageType(new TextEncoder().encode('%PDF-1.7'))).toBe('unknown')
    expect(detectImageType(ftyp('mp42'))).toBe('unknown')
  })
})

describe('isPdf', () => {
  it('%PDF- で始まるものだけ true', () => {
    expect(isPdf(new TextEncoder().encode('%PDF-1.7\n'))).toBe(true)
    expect(isPdf(new TextEncoder().encode('%PDX-1.7'))).toBe(false)
    expect(isPdf(new Uint8Array(2))).toBe(false)
  })
})
