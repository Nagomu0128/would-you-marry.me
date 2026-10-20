// 先頭のバイト列による形式判定（拡張子や Content-Type は信用しない）

export type ImageType = 'jpeg' | 'png' | 'heic' | 'unknown'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

// HEIC / HEIF の ISO BMFF ブランド。mif1・msf1 は AVIF でも使われるため、AVIF の印があれば除く
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'])
const HEIF_GENERIC_BRANDS = new Set(['mif1', 'msf1'])
const AVIF_BRANDS = new Set(['avif', 'avis'])

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((b, i) => bytes[i] === b)
}

function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  )
}

function isHeic(bytes: Uint8Array): boolean {
  // ftyp ボックス: size(4) 'ftyp'(4) major_brand(4) minor_version(4) compatible_brands(4 * n)
  if (bytes.length < 12 || fourcc(bytes, 4) !== 'ftyp') return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const boxSize = view.getUint32(0)
  const end = Math.min(boxSize >= 16 ? boxSize : 16, bytes.length, 256)
  const brands = [fourcc(bytes, 8)]
  for (let offset = 16; offset + 4 <= end; offset += 4) brands.push(fourcc(bytes, offset))

  if (brands.some((b) => AVIF_BRANDS.has(b))) return false
  return brands.some((b) => HEIC_BRANDS.has(b) || HEIF_GENERIC_BRANDS.has(b))
}

export function detectImageType(bytes: Uint8Array): ImageType {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg'
  }
  if (startsWith(bytes, PNG_SIGNATURE)) return 'png'
  if (isHeic(bytes)) return 'heic'
  return 'unknown'
}

/** PDF か（`%PDF-`）。admin の席次表・コース表の確認で使う */
export function isPdf(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
}
