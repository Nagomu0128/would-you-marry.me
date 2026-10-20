// 縮小画像の生成（拡大表示用と一覧用の JPEG）。ブラウザの画像処理は deps にまとめ、計算は純粋な関数にしてある。
// - 写真の向きは EXIF のとおりに直す（createImageBitmap の imageOrientation: 'from-image'）
// - メモリの少ない端末のため、読み込みと同時に目的の大きさへ縮める（resizeWidth / resizeHeight）
// - 元の画像が長辺より小さければ拡大しない
// - 上限のバイト数に収まるまで、品質 → 寸法の順に下げる

import {
  DISPLAY_MAX_BYTES,
  DISPLAY_MAX_EDGE_PX,
  THUMB_MAX_BYTES,
  THUMB_MAX_EDGE_PX,
} from '@wym/shared'

export type Size = { width: number; height: number }

/** 長辺が maxEdge に収まるように縮めた寸法。小さい画像は拡大しない */
export function fitWithin(size: Size, maxEdge: number): Size {
  const longest = Math.max(size.width, size.height)
  if (longest <= maxEdge) return { width: size.width, height: size.height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}

/** 品質を下げていく順 */
export const JPEG_QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35] as const
/** 品質を下げても収まらないときの、寸法の縮め方 */
const SHRINK_FACTOR = 0.8
const MAX_SHRINK_STEPS = 6

export type Encoded = Size & { blob: Blob }

/**
 * maxBytes に収まる JPEG を作る。encode(size, quality) は 1 回分の変換。
 * 最高品質で収まればそれを返す。収まらなければ品質を下げ、それでも収まらなければ寸法を縮めて繰り返す。
 */
export async function encodeWithin(
  start: Size,
  maxBytes: number,
  encode: (size: Size, quality: number) => Promise<Blob>,
): Promise<Encoded> {
  let size = start
  let last: Encoded | undefined
  for (let step = 0; step <= MAX_SHRINK_STEPS; step++) {
    for (const quality of JPEG_QUALITIES) {
      const blob = await encode(size, quality)
      last = { ...size, blob }
      if (blob.size <= maxBytes) return last
    }
    size = {
      width: Math.max(1, Math.round(size.width * SHRINK_FACTOR)),
      height: Math.max(1, Math.round(size.height * SHRINK_FACTOR)),
    }
  }
  // ここまで来るのは極端な画像だけ。最後の結果を返し、サーバーの確認に任せる
  if (!last) throw new Error('encode failed')
  return last
}

/** decode の結果。ブラウザでは ImageBitmap か canvas */
export type Drawable = { close(): void }

/** ブラウザの画像処理（テストでは差し替える） */
export type ImageDeps = {
  /** 向きを反映した元画像の幅・高さ */
  getSize(file: Blob): Promise<Size>
  /** 向きを反映して読み込み、size の大きさに縮める */
  decode(file: Blob, size: Size): Promise<Drawable>
  /** drawable を size の大きさの JPEG にする */
  toJpeg(source: Drawable, size: Size, quality: number): Promise<Blob>
}

export type ResizedImages = {
  display: Blob
  thumb: Blob
  /** 拡大表示用画像の幅・高さ */
  width: number
  height: number
}

export async function createResizedImages(
  file: Blob,
  deps: ImageDeps = browserImageDeps,
): Promise<ResizedImages> {
  const original = await deps.getSize(file)
  const displaySize = fitWithin(original, DISPLAY_MAX_EDGE_PX)
  const source = await deps.decode(file, displaySize)
  try {
    const display = await encodeWithin(displaySize, DISPLAY_MAX_BYTES, (size, quality) =>
      deps.toJpeg(source, size, quality),
    )
    const thumb = await encodeWithin(
      fitWithin(original, THUMB_MAX_EDGE_PX),
      THUMB_MAX_BYTES,
      (size, quality) => deps.toJpeg(source, size, quality),
    )
    return {
      display: display.blob,
      thumb: thumb.blob,
      width: display.width,
      height: display.height,
    }
  } finally {
    source.close()
  }
}

// --- ブラウザの実装 ---

function loadImageElement(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image load failed'))
    }
    img.src = url
  })
}

function makeCanvas(size: Size): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  return canvas
}

export const browserImageDeps: ImageDeps = {
  async getSize(file) {
    // <img> の大きさは、ブラウザが向きを反映したもの
    const img = await loadImageElement(file)
    return { width: img.naturalWidth, height: img.naturalHeight }
  },
  async decode(file, size) {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(file, {
          imageOrientation: 'from-image',
          resizeWidth: size.width,
          resizeHeight: size.height,
          resizeQuality: 'high',
        })
      } catch {
        // resize オプションや imageOrientation が使えない環境は、<img> 経由にする
      }
    }
    const img = await loadImageElement(file)
    const canvas = makeCanvas(size)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas unavailable')
    context.drawImage(img, 0, 0, size.width, size.height)
    return Object.assign(canvas, { close() {} })
  },
  toJpeg(source, size, quality) {
    const canvas = makeCanvas(size)
    const context = canvas.getContext('2d')
    if (!context) return Promise.reject(new Error('canvas unavailable'))
    // 透明な PNG は、JPEG にすると黒くなるので白い背景を敷く
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size.width, size.height)
    if (!(source instanceof HTMLCanvasElement) && !(source instanceof ImageBitmap)) {
      return Promise.reject(new Error('unsupported source'))
    }
    context.drawImage(source, 0, 0, size.width, size.height)
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        quality,
      )
    })
  },
}
