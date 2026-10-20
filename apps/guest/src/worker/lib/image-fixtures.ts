// テスト用の画像をバイト列から組み立てる（テストだけが読み込む）

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

export function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (c) => c.charCodeAt(0))
}

export function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

export function containsText(haystack: Uint8Array, text: string): boolean {
  return indexOfBytes(haystack, ascii(text)) !== -1
}

/** マーカー + 長さ + データ のセグメント */
export function segment(marker: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + data.length)
  out[0] = 0xff
  out[1] = marker
  new DataView(out.buffer).setUint16(2, data.length + 2)
  out.set(data, 4)
  return out
}

/** 秘密の文字列。除去後に残っていないことをテストで確かめる */
export const SECRETS = {
  make: 'SECRETMAKE',
  gpsMethod: 'SECRETGPSMETHOD!',
  xmp: 'SECRETXMP',
  extendedXmp: 'SECRETEXTXMP',
  iptc: 'SECRETIPTC',
  comment: 'SECRETCOMMENT',
  mpf: 'SECRETMPF',
  trailingImage: 'SECRETGAINMAP',
} as const

/**
 * カメラの EXIF に近い構造: IFD0（Make・Orientation・GPS へのポインター）、GPS IFD、IFD1 なし。
 * 値は 4 バイトを超えるときは IFD の後ろに置く。
 */
export function buildExifSegment(options: { little: boolean; orientation?: number }): Uint8Array {
  const { little, orientation } = options
  const make = ascii(`${SECRETS.make}\0`) // 11 バイト
  const gpsMethod = ascii(SECRETS.gpsMethod) // 16 バイト
  const ifd0Entries = orientation === undefined ? 2 : 3
  const ifd0Size = 2 + ifd0Entries * 12 + 4
  const gpsIfdOffset = 8 + ifd0Size
  const gpsEntries = 3
  const gpsIfdSize = 2 + gpsEntries * 12 + 4
  const makeOffset = gpsIfdOffset + gpsIfdSize
  const latOffset = makeOffset + make.length
  const methodOffset = latOffset + 24
  const tiffSize = methodOffset + gpsMethod.length

  const tiff = new Uint8Array(tiffSize)
  const v = new DataView(tiff.buffer)
  v.setUint16(0, little ? 0x4949 : 0x4d4d)
  v.setUint16(2, 42, little)
  v.setUint32(4, 8, little)

  let p = 8
  v.setUint16(p, ifd0Entries, little)
  p += 2
  const entry = (tag: number, type: number, count: number, value: number, shortValue = false) => {
    v.setUint16(p, tag, little)
    v.setUint16(p + 2, type, little)
    v.setUint32(p + 4, count, little)
    if (shortValue) v.setUint16(p + 8, value, little)
    else v.setUint32(p + 8, value, little)
    p += 12
  }
  entry(0x010f, 2, make.length, makeOffset) // Make
  if (orientation !== undefined) entry(0x0112, 3, 1, orientation, true) // Orientation
  entry(0x8825, 4, 1, gpsIfdOffset) // GPSInfo
  v.setUint32(p, 0, little) // 次の IFD なし
  p += 4

  p = gpsIfdOffset
  v.setUint16(p, gpsEntries, little)
  p += 2
  entry(0x0001, 2, 2, 0x4e000000) // GPSLatitudeRef "N"（値は先頭バイトから）
  entry(0x0002, 5, 3, latOffset) // GPSLatitude
  entry(0x001b, 7, gpsMethod.length, methodOffset) // GPSProcessingMethod
  v.setUint32(p, 0, little)

  tiff.set(make, makeOffset)
  for (let i = 0; i < 6; i++) v.setUint32(latOffset + i * 4, i % 2 === 0 ? 35 + i : 1, little)
  tiff.set(gpsMethod, methodOffset)

  return segment(0xe1, concat(ascii('Exif\0\0'), tiff))
}

export function buildXmpSegment(): Uint8Array {
  return segment(
    0xe1,
    concat(ascii('http://ns.adobe.com/xap/1.0/\0'), ascii(`<x:xmpmeta>${SECRETS.xmp}</x:xmpmeta>`)),
  )
}

export function buildExtendedXmpSegment(): Uint8Array {
  return segment(
    0xe1,
    concat(
      ascii('http://ns.adobe.com/xmp/extension/\0'),
      ascii(`0123456789ABCDEF0123456789ABCDEF${SECRETS.extendedXmp}`),
    ),
  )
}

export function buildIptcSegment(): Uint8Array {
  return segment(0xed, concat(ascii('Photoshop 3.0\0'), ascii(`8BIM${SECRETS.iptc}`)))
}

export function buildIccSegments(): Uint8Array[] {
  const header = (seq: number, total: number) =>
    concat(ascii('ICC_PROFILE\0'), Uint8Array.of(seq, total))
  const chunk = (seed: number) => Uint8Array.from({ length: 300 }, (_, i) => (seed + i * 7) & 0xff)
  return [
    segment(0xe2, concat(header(1, 2), chunk(1))),
    segment(0xe2, concat(header(2, 2), chunk(2))),
  ]
}

export function buildMpfSegment(): Uint8Array {
  return segment(0xe2, concat(ascii('MPF\0'), ascii(`II*\0${SECRETS.mpf}`)))
}

export function buildJfifSegment(): Uint8Array {
  return segment(0xe0, Uint8Array.of(0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0))
}

export function buildAdobeSegment(): Uint8Array {
  return segment(0xee, Uint8Array.of(0x41, 0x64, 0x6f, 0x62, 0x65, 0, 100, 0, 0, 0, 0, 1))
}

export function buildCommentSegment(): Uint8Array {
  return segment(0xfe, ascii(SECRETS.comment))
}

const DQT = segment(
  0xdb,
  concat(
    Uint8Array.of(0),
    Uint8Array.from({ length: 64 }, (_, i) => i + 1),
  ),
)
const SOF0 = segment(0xc0, Uint8Array.of(8, 0, 16, 0, 16, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1))
const SOF2 = segment(0xc2, Uint8Array.of(8, 0, 16, 0, 16, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1))
const DHT = (id: number) =>
  segment(
    0xc4,
    concat(
      Uint8Array.of(id),
      Uint8Array.of(0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0),
      Uint8Array.of(0, 1, 2, 3, 4, 5, 6, 7),
    ),
  )
const DRI = segment(0xdd, Uint8Array.of(0, 4))
const SOS = (components = 3) =>
  segment(0xda, Uint8Array.of(components, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0))

/** FF00（バイトスタッフィング）と RST を含む圧縮データ。FF の直後は 00 か RSTn だけ */
export function entropyData(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length)
  let state = seed >>> 0 || 1
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const b = state >>> 24
    out[i] = b === 0xff ? 0xfe : b
  }
  let rst = 0
  for (let i = 100; i + 1 < length; i += 997) {
    out[i] = 0xff
    out[i + 1] = 0x00
  }
  for (let i = 500; i + 1 < length; i += 4099) {
    out[i] = 0xff
    out[i + 1] = 0xd0 + (rst++ % 8)
  }
  // 各 FF の前後が壊れないよう、FF の次が FF になる並びは作らない（末尾の FF も避ける）
  if (length > 0) out[length - 1] = 0x11
  return out
}

const SOI = Uint8Array.of(0xff, 0xd8)
export const EOI = Uint8Array.of(0xff, 0xd9)

/** 画像データ部分（DQT から EOI まで）。除去の前後でバイト単位で同じになるべき部分 */
export function buildImageData(options: {
  progressive: boolean
  entropyLength: number
}): Uint8Array {
  const { progressive, entropyLength } = options
  if (!progressive) {
    return concat(DQT, SOF0, DHT(0x00), DHT(0x10), DRI, SOS(), entropyData(entropyLength, 7), EOI)
  }
  // プログレッシブ: スキャンの間に DHT が入る
  return concat(
    DQT,
    SOF2,
    DHT(0x00),
    SOS(),
    entropyData(Math.floor(entropyLength / 3), 11),
    DHT(0x10),
    SOS(),
    entropyData(Math.floor(entropyLength / 3), 12),
    DHT(0x01),
    DRI,
    SOS(),
    entropyData(Math.floor(entropyLength / 3), 13),
    EOI,
  )
}

/** iPhone のように MPF で追加の画像（ゲインマップなど）が EOI の後ろに付く構造 */
export function buildTrailingImage(): Uint8Array {
  return concat(
    SOI,
    segment(0xe1, ascii(`${SECRETS.trailingImage}GPS`)),
    DQT,
    SOF0,
    SOS(),
    entropyData(2000, 99),
    EOI,
  )
}

export type JpegOptions = {
  little?: boolean
  orientation?: number
  exif?: boolean
  progressive?: boolean
  entropyLength?: number
  trailingImage?: boolean
  mpf?: boolean
}

export type BuiltJpeg = {
  bytes: Uint8Array
  /** DQT から EOI まで */
  imageData: Uint8Array
  icc: Uint8Array[]
}

export function buildJpeg(options: JpegOptions = {}): BuiltJpeg {
  const {
    little = true,
    orientation = 6,
    exif = true,
    progressive = false,
    entropyLength = 5000,
    trailingImage = true,
    mpf = true,
  } = options
  const icc = buildIccSegments()
  const imageData = buildImageData({ progressive, entropyLength })
  const parts = [
    SOI,
    buildJfifSegment(),
    ...(exif
      ? [buildExifSegment({ little, orientation: orientation === 0 ? undefined : orientation })]
      : []),
    buildXmpSegment(),
    buildExtendedXmpSegment(),
    ...(mpf ? [buildMpfSegment()] : []),
    ...icc,
    buildIptcSegment(),
    buildAdobeSegment(),
    buildCommentSegment(),
    imageData,
    ...(trailingImage ? [buildTrailingImage()] : []),
  ]
  return { bytes: concat(...parts), imageData, icc }
}

export type ParsedSegment = { marker: number; start: number; end: number }

/** 検証用の独立した JPEG パーサー（SOS の圧縮データは読み飛ばす）。EOI まで */
export function listJpegSegments(bytes: Uint8Array): ParsedSegment[] {
  const result: ParsedSegment[] = []
  let pos = 2
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) throw new Error(`marker expected at ${pos}`)
    const marker = bytes[pos + 1] as number
    if (marker === 0xd9) {
      result.push({ marker, start: pos, end: pos + 2 })
      break
    }
    const length = (bytes[pos + 2] as number) * 256 + (bytes[pos + 3] as number)
    let end = pos + 2 + length
    result.push({ marker, start: pos, end })
    if (marker === 0xda) {
      while (end < bytes.length) {
        if (bytes[end] === 0xff) {
          const next = bytes[end + 1] as number
          if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) break
          end += 2
        } else end++
      }
      const last = result[result.length - 1] as ParsedSegment
      last.end = end
    }
    pos = end
  }
  return result
}

// ---------------------------------------------------------------- PNG

function crcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}
const CRC_TABLE = crcTable()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(ascii(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

export const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)

export function buildPng(options: { trailing?: boolean } = {}) {
  const chunks = {
    IHDR: pngChunk('IHDR', Uint8Array.of(0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0, 0)),
    sRGB: pngChunk('sRGB', Uint8Array.of(0)),
    eXIf: pngChunk('eXIf', ascii(`MM\0*${SECRETS.make}`)),
    tEXt: pngChunk('tEXt', ascii('Comment\0SECRETTEXT')),
    zTXt: pngChunk('zTXt', ascii('Comment\0\0SECRETZTXT')),
    iTXt: pngChunk('iTXt', ascii('XML:com.adobe.xmp\0\0\0\0\0SECRETITXT')),
    pHYs: pngChunk('pHYs', Uint8Array.of(0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1)),
    IDAT1: pngChunk('IDAT', entropyData(300, 3)),
    IDAT2: pngChunk('IDAT', entropyData(200, 4)),
    IEND: pngChunk('IEND', new Uint8Array(0)),
  }
  const bytes = concat(
    PNG_SIGNATURE,
    chunks.IHDR,
    chunks.sRGB,
    chunks.eXIf,
    chunks.tEXt,
    chunks.pHYs,
    chunks.iTXt,
    chunks.IDAT1,
    chunks.zTXt,
    chunks.IDAT2,
    chunks.IEND,
    ...(options.trailing === false ? [] : [ascii('SECRETTRAILING')]),
  )
  return { bytes, chunks }
}
