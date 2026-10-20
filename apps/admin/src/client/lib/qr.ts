import QRCode from 'qrcode'

/** 誤り訂正レベル（M 以上。印刷で汚れても読めるよう Q） */
export const QR_ERROR_CORRECTION = 'Q'
/** 余白（quiet zone）のモジュール数。仕様の最小値 4 */
export const QR_QUIET_ZONE = 4
/** 保存する PNG の一辺（px、仮置き） */
export const QR_PNG_SIZE = 1024

export type QrMatrix = {
  /** 1 辺のモジュール数 */
  size: number
  isDark: (row: number, col: number) => boolean
}

export function createQrMatrix(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: QR_ERROR_CORRECTION })
  const { size, data } = qr.modules
  return { size, isDark: (row, col) => data[row * size + col] === 1 }
}

/** 余白つきで 1 辺 `size` px の PNG にする。モジュールの境目は整数の px に丸めてくっきり描く */
export function renderQrPng(matrix: QrMatrix, size = QR_PNG_SIZE): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('canvas unavailable'))
  const total = matrix.size + QR_QUIET_ZONE * 2
  const cell = size / total
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#000000'
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (!matrix.isDark(r, c)) continue
      const x0 = Math.round((c + QR_QUIET_ZONE) * cell)
      const x1 = Math.round((c + QR_QUIET_ZONE + 1) * cell)
      const y0 = Math.round((r + QR_QUIET_ZONE) * cell)
      const y1 = Math.round((r + QR_QUIET_ZONE + 1) * cell)
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
    }
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/png',
    )
  })
}

/** 保存するファイル名。テナント名を含めない */
export function qrFileName(tenantId: string): string {
  return `join-qr-${tenantId.slice(0, 8)}.png`
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
