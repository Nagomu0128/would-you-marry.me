// 先頭のバイト列によるファイル形式の判定（拡張子や Content-Type は信用しない）

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((b, i) => bytes[i] === b)
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const // %PDF-

/** PDF か（`%PDF-`） */
export function isPdf(bytes: Uint8Array): boolean {
  return startsWith(bytes, PDF_SIGNATURE)
}

/** JPEG か PNG か。どちらでもなければ null */
export function detectImageContentType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png'
  return null
}
