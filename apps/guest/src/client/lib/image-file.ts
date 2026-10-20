// 選んだファイルの確認（SG-07）。拡張子や MIME ではなく、ファイルの先頭のバイト列で形式を見る（API と同じ）。
// 形式（JPEG / PNG）→ サイズ（10MB まで）の順に確認する。

import { ORIGINAL_MAX_BYTES } from '@wym/shared'

export type ImageKind = 'jpeg' | 'png'

export type FileCheck =
  | { ok: true; kind: ImageKind }
  | { ok: false; code: 'UNSUPPORTED_FILE_TYPE' | 'FILE_TOO_LARGE' }

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** 先頭のバイト列から形式を判定する。JPEG / PNG 以外（HEIC など）は null */
export function detectImageKind(head: Uint8Array): ImageKind | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg'
  if (head.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, i) => head[i] === byte)) {
    return 'png'
  }
  return null
}

export async function checkImageFile(file: Blob): Promise<FileCheck> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const kind = detectImageKind(head)
  if (!kind) return { ok: false, code: 'UNSUPPORTED_FILE_TYPE' }
  if (file.size > ORIGINAL_MAX_BYTES) return { ok: false, code: 'FILE_TOO_LARGE' }
  return { ok: true, kind }
}
