// オリジナル画像からのメタデータ除去。再圧縮はしない（バイト列を組み立て直すだけ）
//
// 大きな入力（最大 10MB）でもコピーを最小限にするため、残す範囲（入力の [start, end)）と
// 新しく作る小さなセグメントを並べ、最後に出力を 1 回だけ確保して書き込む。

import { detectImageType } from './image-type'

/** 壊れた画像、または対応していない形式。呼び出し側で UNSUPPORTED_FILE_TYPE にする */
export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidImageError'
  }
}

type Part = { source: true; start: number; end: number } | { source: false; data: Uint8Array }

/** 入力の範囲と作ったバイト列を並べて、出力を 1 回の確保で組み立てる */
class Assembler {
  private readonly parts: Part[] = []

  constructor(private readonly input: Uint8Array) {}

  keep(start: number, end: number): void {
    const last = this.parts.at(-1)
    if (last?.source && last.end === start) {
      last.end = end // 連続する範囲は 1 つにまとめる
      return
    }
    this.parts.push({ source: true, start, end })
  }

  add(data: Uint8Array): void {
    this.parts.push({ source: false, data })
  }

  build(): Uint8Array {
    const only = this.parts[0]
    if (this.parts.length === 1 && only?.source) {
      return this.input.subarray(only.start, only.end) // コピーなし（入力のビュー）
    }
    let total = 0
    for (const p of this.parts) total += p.source ? p.end - p.start : p.data.length
    const out = new Uint8Array(total)
    let offset = 0
    for (const p of this.parts) {
      const chunk = p.source ? this.input.subarray(p.start, p.end) : p.data
      out.set(chunk, offset)
      offset += chunk.length
    }
    return out
  }
}

// ---------------------------------------------------------------- JPEG

const EXIF_HEADER: readonly number[] = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] // "Exif\0\0"
const ICC_HEADER: readonly number[] = [...'ICC_PROFILE'].map((c) => c.charCodeAt(0)).concat(0)
const ORIENTATION_TAG = 0x0112

function hasPrefix(bytes: Uint8Array, offset: number, end: number, prefix: readonly number[]) {
  if (end - offset < prefix.length) return false
  return prefix.every((b, i) => bytes[offset + i] === b)
}

/** EXIF の TIFF 部分から向きを読む。読めない・範囲外の値なら undefined */
function readOrientation(bytes: Uint8Array, tiffStart: number, end: number): number | undefined {
  if (end - tiffStart < 8) return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset + tiffStart, end - tiffStart)
  const order = view.getUint16(0)
  const little = order === 0x4949
  if (!little && order !== 0x4d4d) return undefined
  if (view.getUint16(2, little) !== 42) return undefined

  const ifdOffset = view.getUint32(4, little)
  if (ifdOffset < 8 || ifdOffset + 2 > view.byteLength) return undefined
  const count = view.getUint16(ifdOffset, little)
  for (let i = 0; i < count; i++) {
    const entry = ifdOffset + 2 + i * 12
    if (entry + 12 > view.byteLength) return undefined
    if (view.getUint16(entry, little) !== ORIENTATION_TAG) continue
    const type = view.getUint16(entry + 2, little)
    const n = view.getUint32(entry + 4, little)
    if (type !== 3 || n !== 1) return undefined
    const value = view.getUint16(entry + 8, little)
    return value >= 1 && value <= 8 ? value : undefined
  }
  return undefined
}

/** 向きだけを持つ最小の EXIF の APP1 セグメント（マーカー込み、36 バイト）を作る */
function buildOrientationExif(orientation: number, little: boolean): Uint8Array {
  const out = new Uint8Array(36)
  const view = new DataView(out.buffer)
  view.setUint16(0, 0xffe1)
  view.setUint16(2, 34) // 長さ（長さ自身を含む）
  out.set(EXIF_HEADER, 4)
  // TIFF ヘッダー（out[10] から）
  view.setUint16(10, little ? 0x4949 : 0x4d4d)
  view.setUint16(12, 42, little)
  view.setUint32(14, 8, little) // IFD0 のオフセット
  // IFD0: エントリー 1 つ
  view.setUint16(18, 1, little)
  view.setUint16(20, ORIENTATION_TAG, little)
  view.setUint16(22, 3, little) // SHORT
  view.setUint32(24, 1, little)
  view.setUint16(28, orientation, little)
  // 値フィールドの残り 2 バイトと、次の IFD のオフセット（0）は 0 のまま
  return out
}

/**
 * JPEG からメタデータを取り除く。再圧縮はしない。
 * - 残す: APP0（JFIF）、ICC プロファイル（APP2）、APP14（Adobe）、画像データに必要なセグメントすべて
 * - 作り直す: EXIF（向きだけ。なければ削除）
 * - 削除: XMP、IPTC などの他の APPn、COM、MPF
 * - 主画像の EOI より後ろ（MPF の追加画像など）は切り捨てる
 * 壊れた JPEG（SOI・EOI がない、長さが範囲外）は InvalidImageError を投げる。
 * 戻り値は入力のビューのことがある（取り除くものが何もないとき）。
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const size = bytes.length
  if (size < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new InvalidImageError('JPEG: SOI がありません')
  }
  const asm = new Assembler(bytes)
  asm.keep(0, 2)

  let exifDone = false // 最初の EXIF だけを扱う
  let pos = 2
  let sawEoi = false

  while (pos < size) {
    // マーカー: 0xFF（フィルとして連続してもよい）の後ろに種別
    if (bytes[pos] !== 0xff) throw new InvalidImageError('JPEG: マーカーの位置が不正です')
    let markerPos = pos + 1
    while (markerPos < size && bytes[markerPos] === 0xff) markerPos++
    const marker = bytes[markerPos]
    if (marker === undefined) throw new InvalidImageError('JPEG: マーカーが途中で終わっています')
    const segStart = markerPos - 1 // 0xFF + 種別 の先頭

    if (marker === 0xd9) {
      asm.keep(segStart, markerPos + 1)
      sawEoi = true
      break // EOI より後ろは切り捨て
    }
    if (marker === 0x00) throw new InvalidImageError('JPEG: マーカーが不正です')
    // 長さを持たないマーカー（SOI・RSTn・TEM）。通常ここには現れないが、そのまま残す
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      asm.keep(segStart, markerPos + 1)
      pos = markerPos + 1
      continue
    }

    if (markerPos + 3 > size) throw new InvalidImageError('JPEG: セグメントの長さがありません')
    const length = (bytes[markerPos + 1] as number) * 256 + (bytes[markerPos + 2] as number)
    const dataStart = markerPos + 3
    const segEnd = markerPos + 1 + length
    if (length < 2 || segEnd > size) {
      throw new InvalidImageError('JPEG: セグメントの長さが範囲外です')
    }

    if (marker === 0xda) {
      // SOS: ヘッダーを残し、続く圧縮データ（バイトスタッフィング・RST を含む）を次のマーカーまで進める
      pos = skipEntropyData(bytes, segEnd)
      asm.keep(segStart, pos)
      continue
    }

    const decision = decideSegment(bytes, marker, dataStart, segEnd)
    if (decision === 'keep') {
      asm.keep(segStart, segEnd)
    } else if (decision === 'exif' && !exifDone) {
      exifDone = true
      const tiffStart = dataStart + EXIF_HEADER.length
      const orientation = readOrientation(bytes, tiffStart, segEnd)
      if (orientation !== undefined) {
        asm.add(buildOrientationExif(orientation, bytes[tiffStart] === 0x49))
      }
    }
    pos = segEnd
  }

  if (!sawEoi) throw new InvalidImageError('JPEG: EOI がありません')
  return asm.build()
}

function decideSegment(
  bytes: Uint8Array,
  marker: number,
  dataStart: number,
  segEnd: number,
): 'keep' | 'drop' | 'exif' {
  if (marker === 0xe1) {
    return hasPrefix(bytes, dataStart, segEnd, EXIF_HEADER) ? 'exif' : 'drop' // XMP などは削除
  }
  if (marker === 0xe2) {
    return hasPrefix(bytes, dataStart, segEnd, ICC_HEADER) ? 'keep' : 'drop' // MPF などは削除
  }
  if (marker === 0xe0 || marker === 0xee) return 'keep' // JFIF、Adobe（色変換に影響する）
  if (marker >= 0xe3 && marker <= 0xef) return 'drop' // APP13（IPTC / Photoshop）ほか
  if (marker === 0xfe) return 'drop' // COM
  return 'keep' // DQT・SOFn・DHT・DRI・DNL など
}

/** SOS ヘッダーの後ろの圧縮データを読み飛ばし、次のマーカー（FF00・RSTn・フィル以外）の位置を返す */
function skipEntropyData(bytes: Uint8Array, from: number): number {
  const size = bytes.length
  let pos = from
  for (;;) {
    pos = bytes.indexOf(0xff, pos) // ネイティブの走査で速く進む
    if (pos === -1 || pos + 1 >= size) throw new InvalidImageError('JPEG: EOI がありません')
    const next = bytes[pos + 1] as number
    if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
      pos += 2 // バイトスタッフィング、RSTn
    } else if (next === 0xff) {
      pos += 1 // フィル
    } else {
      return pos
    }
  }
}

// ---------------------------------------------------------------- PNG

const PNG_SIGNATURE_LENGTH = 8
const PNG_DROPPED_CHUNKS = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt'])

/**
 * PNG から eXIf・tEXt・iTXt・zTXt を取り除く。他のチャンクは CRC も含めてそのまま残す。
 * IEND の後ろは切り捨てる。長さが範囲外、IHDR・IEND がない場合は InvalidImageError。
 */
export function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  if (detectImageType(bytes) !== 'png') throw new InvalidImageError('PNG: シグネチャが不正です')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const size = bytes.length
  const asm = new Assembler(bytes)
  asm.keep(0, PNG_SIGNATURE_LENGTH)

  let pos = PNG_SIGNATURE_LENGTH
  let first = true
  while (pos < size) {
    if (pos + 12 > size) throw new InvalidImageError('PNG: チャンクが途中で終わっています')
    const length = view.getUint32(pos)
    const end = pos + 12 + length // 長さ(4) + 種別(4) + データ + CRC(4)
    if (length > 0x7fffffff || end > size) {
      throw new InvalidImageError('PNG: チャンクの長さが範囲外です')
    }
    const type = String.fromCharCode(
      bytes[pos + 4] as number,
      bytes[pos + 5] as number,
      bytes[pos + 6] as number,
      bytes[pos + 7] as number,
    )
    if (first && type !== 'IHDR') throw new InvalidImageError('PNG: IHDR がありません')
    first = false

    if (!PNG_DROPPED_CHUNKS.has(type)) asm.keep(pos, end)
    pos = end
    if (type === 'IEND') return asm.build() // 後ろのデータは切り捨て
  }
  throw new InvalidImageError('PNG: IEND がありません')
}

// ---------------------------------------------------------------- 共通

export type StrippedImage = {
  bytes: Uint8Array
  contentType: 'image/jpeg' | 'image/png'
  type: 'jpeg' | 'png'
}

/** 形式を判定してメタデータを取り除く。JPEG・PNG 以外は InvalidImageError */
export function stripMetadata(bytes: Uint8Array): StrippedImage {
  const type = detectImageType(bytes)
  if (type === 'jpeg') {
    return { bytes: stripJpegMetadata(bytes), contentType: 'image/jpeg', type }
  }
  if (type === 'png') {
    return { bytes: stripPngMetadata(bytes), contentType: 'image/png', type }
  }
  throw new InvalidImageError(`対応していない形式です: ${type}`)
}
