import { describe, expect, it } from 'vitest'
import {
  ascii,
  buildJpeg,
  buildPng,
  concat,
  containsText,
  EOI,
  entropyData,
  indexOfBytes,
  listJpegSegments,
  SECRETS,
  segment,
} from './image-fixtures'
import {
  InvalidImageError,
  stripJpegMetadata,
  stripMetadata,
  stripPngMetadata,
} from './strip-metadata'

/** 出力の EXIF から Orientation を読む独立した実装 */
function orientationOf(bytes: Uint8Array): { value: number; little: boolean } | undefined {
  const exif = listJpegSegments(bytes).filter(
    (s) => s.marker === 0xe1 && containsText(bytes.subarray(s.start, s.end), 'Exif'),
  )
  expect(exif.length).toBeLessThanOrEqual(1)
  const seg = exif[0]
  if (!seg) return undefined
  const tiff = bytes.subarray(seg.start + 10, seg.end)
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength)
  const little = view.getUint16(0) === 0x4949
  const ifd = view.getUint32(4, little)
  const count = view.getUint16(ifd, little)
  expect(count).toBe(1)
  expect(view.getUint16(ifd + 2, little)).toBe(0x0112)
  expect(view.getUint32(ifd + 2 + 12, little)).toBe(0) // 次の IFD なし
  return { value: view.getUint16(ifd + 2 + 8, little), little }
}

describe('stripJpegMetadata', () => {
  describe.each([
    ['リトルエンディアン', true],
    ['ビッグエンディアン', false],
  ])('EXIF が%s', (_label, little) => {
    it.each([1, 3, 6, 8])('向き %i だけを残し、位置情報などを除く', (orientation) => {
      const { bytes } = buildJpeg({ little, orientation })
      // 前提: 入力には秘密が全部入っている
      for (const s of Object.values(SECRETS)) expect(containsText(bytes, s)).toBe(true)

      const out = stripJpegMetadata(bytes)
      for (const s of Object.values(SECRETS)) expect(containsText(out, s)).toBe(false)
      expect(orientationOf(out)).toEqual({ value: orientation, little })
    })
  })

  it('向きがない EXIF は EXIF ごと削除する', () => {
    const { bytes } = buildJpeg({ orientation: 0 })
    const out = stripJpegMetadata(bytes)
    expect(orientationOf(out)).toBeUndefined()
    expect(containsText(out, 'Exif')).toBe(false)
    expect(containsText(out, SECRETS.make)).toBe(false)
  })

  it('EXIF が元からない JPEG でも通る', () => {
    const { bytes } = buildJpeg({ exif: false })
    const out = stripJpegMetadata(bytes)
    expect(orientationOf(out)).toBeUndefined()
  })

  it('DQT〜EOI の画像データがバイト単位で同じ（基本・プログレッシブ）', () => {
    for (const progressive of [false, true]) {
      const { bytes, imageData } = buildJpeg({ progressive, entropyLength: 20000 })
      const out = stripJpegMetadata(bytes)
      const start = indexOfBytes(out, imageData.subarray(0, 8))
      expect(start).toBeGreaterThan(0)
      expect(out.subarray(start)).toEqual(imageData) // EOI で終わる（追加画像なし）
    }
  })

  it('EOI の後ろの追加画像（MPF のゲインマップなど）を切り捨てる', () => {
    const { bytes, imageData } = buildJpeg()
    expect(containsText(bytes, SECRETS.trailingImage)).toBe(true)
    const out = stripJpegMetadata(bytes)
    expect(out.subarray(out.length - 2)).toEqual(EOI)
    expect(out.subarray(out.length - imageData.length)).toEqual(imageData)
    expect(containsText(out, SECRETS.trailingImage)).toBe(false)
  })

  it('ICC プロファイル（複数セグメント）を同じ順序で残し、JFIF・Adobe も残す', () => {
    const { bytes, icc } = buildJpeg()
    const out = stripJpegMetadata(bytes)
    const segments = listJpegSegments(out)
    const iccOut = segments
      .filter((s) => s.marker === 0xe2)
      .map((s) => out.subarray(s.start, s.end))
    expect(iccOut).toEqual(icc)
    expect(segments.map((s) => s.marker.toString(16))).toEqual(expect.arrayContaining(['e0', 'ee']))
    // XMP・IPTC・COM・MPF の APPn は残らない
    expect(segments.some((s) => [0xed, 0xfe].includes(s.marker))).toBe(false)
    expect(segments.filter((s) => s.marker === 0xe1)).toHaveLength(1)
  })

  it('出力は元より小さく、出力を再度通しても同じ（冪等）', () => {
    const { bytes } = buildJpeg()
    const once = stripJpegMetadata(bytes)
    expect(once.length).toBeLessThan(bytes.length)
    expect(stripJpegMetadata(once)).toEqual(once)
  })

  it('圧縮データ中の FF00・RST を誤ってマーカーと見なさない', () => {
    const { bytes, imageData } = buildJpeg({ entropyLength: 50000 })
    const sos = listJpegSegments(concat(Uint8Array.of(0xff, 0xd8), imageData)).find(
      (s) => s.marker === 0xda,
    )
    expect(sos).toBeDefined()
    const out = stripJpegMetadata(bytes)
    expect(out.subarray(out.length - imageData.length)).toEqual(imageData)
  })

  it('取り除くものがなければコピーせずに入力のビューを返す', () => {
    const plain = concat(
      Uint8Array.of(0xff, 0xd8),
      segment(0xdb, new Uint8Array(65)),
      segment(0xda, Uint8Array.of(1, 1, 0, 0, 63, 0)),
      entropyData(100),
      EOI,
    )
    const out = stripJpegMetadata(plain)
    expect(out.buffer).toBe(plain.buffer)
    expect(out).toEqual(plain)
  })

  describe('壊れた入力', () => {
    const { bytes } = buildJpeg()

    it('SOI がない', () => {
      expect(() => stripJpegMetadata(bytes.subarray(2))).toThrow(InvalidImageError)
      expect(() => stripJpegMetadata(new Uint8Array(0))).toThrow(InvalidImageError)
    })

    it('セグメントの長さが範囲外', () => {
      const broken = concat(
        Uint8Array.of(0xff, 0xd8),
        Uint8Array.of(0xff, 0xe1, 0xff, 0xff),
        new Uint8Array(10),
      )
      expect(() => stripJpegMetadata(broken)).toThrow(InvalidImageError)
    })

    it('長さが 2 未満', () => {
      const broken = concat(Uint8Array.of(0xff, 0xd8, 0xff, 0xe1, 0, 1), EOI)
      expect(() => stripJpegMetadata(broken)).toThrow(InvalidImageError)
    })

    it('EOI がない（途中で切れた）入力は例外にする', () => {
      const withEoi = buildJpeg({ trailingImage: false }).bytes
      expect(() => stripJpegMetadata(withEoi.subarray(0, -2))).toThrow(InvalidImageError)
      expect(() => stripJpegMetadata(withEoi.subarray(0, -200))).toThrow(InvalidImageError)
    })

    it('ヘッダー部分で切れた入力', () => {
      for (const n of [3, 5, 20, 100]) {
        expect(() => stripJpegMetadata(bytes.subarray(0, n))).toThrow(InvalidImageError)
      }
    })

    it('マーカーでない位置に別のデータがある', () => {
      const broken = concat(Uint8Array.of(0xff, 0xd8), ascii('garbage'), EOI)
      expect(() => stripJpegMetadata(broken)).toThrow(InvalidImageError)
    })
  })
})

describe('stripPngMetadata', () => {
  it('eXIf・tEXt・iTXt・zTXt だけを消し、他のチャンクはバイト単位で同じ', () => {
    const { bytes, chunks } = buildPng()
    const out = stripPngMetadata(bytes)
    const expected = concat(
      bytes.subarray(0, 8),
      chunks.IHDR,
      chunks.sRGB,
      chunks.pHYs,
      chunks.IDAT1,
      chunks.IDAT2,
      chunks.IEND,
    )
    expect(out).toEqual(expected)
    for (const s of ['SECRETTEXT', 'SECRETZTXT', 'SECRETITXT', SECRETS.make, 'SECRETTRAILING']) {
      expect(containsText(out, s)).toBe(false)
    }
  })

  it('取り除くものがなければコピーせずに入力のビューを返す', () => {
    const { bytes } = buildPng({ trailing: false })
    const clean = stripPngMetadata(bytes)
    const again = stripPngMetadata(clean)
    expect(again.buffer).toBe(clean.buffer)
    expect(again).toEqual(clean)
  })

  it('壊れた入力は例外', () => {
    const { bytes } = buildPng()
    expect(() => stripPngMetadata(bytes.subarray(0, 4))).toThrow(InvalidImageError)
    expect(() => stripPngMetadata(bytes.subarray(0, 40))).toThrow(InvalidImageError) // 途中で切れた
    const noIend = bytes.subarray(0, bytes.length - 12 - 'SECRETTRAILING'.length)
    expect(() => stripPngMetadata(noIend)).toThrow(InvalidImageError)
    const badLength = bytes.slice()
    new DataView(badLength.buffer).setUint32(8, 0xfffffff0) // IHDR の長さ
    expect(() => stripPngMetadata(badLength)).toThrow(InvalidImageError)
    const notIhdrFirst = concat(
      bytes.subarray(0, 8),
      buildPng().chunks.sRGB,
      buildPng().chunks.IEND,
    )
    expect(() => stripPngMetadata(notIhdrFirst)).toThrow(InvalidImageError)
  })
})

describe('stripMetadata', () => {
  it('形式を判定して振り分け、Content-Type を返す', () => {
    const jpeg = stripMetadata(buildJpeg().bytes)
    expect(jpeg.type).toBe('jpeg')
    expect(jpeg.contentType).toBe('image/jpeg')
    const png = stripMetadata(buildPng().bytes)
    expect(png.type).toBe('png')
    expect(png.contentType).toBe('image/png')
  })

  it('JPEG・PNG 以外は例外', () => {
    expect(() => stripMetadata(ascii('GIF89a......'))).toThrow(InvalidImageError)
    expect(() => stripMetadata(new Uint8Array(0))).toThrow(InvalidImageError)
  })
})

describe('性能（10MB の JPEG）', () => {
  it('Workers の実行環境で 200ms 未満', () => {
    const { bytes } = buildJpeg({ entropyLength: 10 * 1024 * 1024, progressive: true })
    expect(bytes.length).toBeGreaterThanOrEqual(10 * 1024 * 1024)

    stripJpegMetadata(bytes) // ウォームアップ
    const times: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      const out = stripJpegMetadata(bytes)
      times.push(performance.now() - t0)
      expect(out.length).toBeLessThan(bytes.length)
    }
    times.sort((a, b) => a - b)
    const median = times[2] as number
    console.log(
      `[perf] 10MB JPEG strip: median ${median.toFixed(1)}ms, min ${times[0]?.toFixed(1)}ms, max ${times[4]?.toFixed(1)}ms`,
    )
    expect(median).toBeLessThan(200)
  })
})
