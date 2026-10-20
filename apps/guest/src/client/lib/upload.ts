// 写真の送信（POST /photos）。送信の進捗が要るので、fetch ではなく XMLHttpRequest を使う。

import type { UploadPhotoResponse } from '@wym/shared'
import { NetworkError, toApiError } from './api'

export type UploadParts = {
  original: Blob
  display: Blob
  thumb: Blob
  /** 拡大表示用画像の幅・高さ */
  width: number
  height: number
}

export type UploadOptions = {
  /** 送信の進捗（0〜100） */
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

export function buildUploadForm(parts: UploadParts): FormData {
  const form = new FormData()
  form.append('original', parts.original, 'original')
  form.append('display', parts.display, 'display.jpg')
  form.append('thumb', parts.thumb, 'thumb.jpg')
  form.append('width', String(parts.width))
  form.append('height', String(parts.height))
  return form
}

/**
 * 成功したら写真を返す。API のエラーは ApiClientError、通信できなかったときは NetworkError。
 * 中断（signal）したときは AbortError（DOMException）。
 */
export function uploadPhoto(
  tenantId: string,
  parts: UploadParts,
  options: UploadOptions = {},
): Promise<UploadPhotoResponse> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'))
      return
    }
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/t/${encodeURIComponent(tenantId)}/photos`)
    xhr.withCredentials = true
    xhr.responseType = 'text'
    xhr.setRequestHeader('Accept', 'application/json')

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total === 0) return
      options.onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    }
    xhr.onload = () => {
      const text = typeof xhr.response === 'string' ? xhr.response : ''
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(text) as UploadPhotoResponse
          options.onProgress?.(100)
          resolve(body)
        } catch (error) {
          reject(new NetworkError(error))
        }
        return
      }
      toApiError(new Response(text, { status: xhr.status })).then(reject, reject)
    }
    xhr.onerror = () => reject(new NetworkError())
    xhr.ontimeout = () => reject(new NetworkError())
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'))
    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true })

    xhr.send(buildUploadForm(parts))
  })
}
