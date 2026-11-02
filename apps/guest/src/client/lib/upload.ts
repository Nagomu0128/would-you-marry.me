// 写真の送信（POST /photos）。送信の進捗が要るので、fetch ではなく XMLHttpRequest を使う。

import { UPLOAD_KEY_HEADER, UPLOAD_STALL_TIMEOUT_MS, type UploadPhotoResponse } from '@wym/shared'
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
  /** 投稿キー（D-41）。あれば Idempotency-Key ヘッダーで送る。再送では同じ値を渡す */
  uploadKey?: string
  /** 通信の動きがこの時間なければ打ち切る（ミリ秒）。既定は UPLOAD_STALL_TIMEOUT_MS */
  stallTimeoutMs?: number
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
 * 通信の動きが stallTimeoutMs の間なければ打ち切り、NetworkError にする（全体の時間では打ち切らない）。
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
    if (options.uploadKey) xhr.setRequestHeader(UPLOAD_KEY_HEADER, options.uploadKey)

    const stallMs = options.stallTimeoutMs ?? UPLOAD_STALL_TIMEOUT_MS
    let timer: ReturnType<typeof setTimeout> | null = null
    let settled = false
    const stopTimer = () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
    }
    const settle = (finish: () => void) => {
      if (settled) return
      settled = true
      stopTimer()
      finish()
    }
    /** 通信に動きがあった。見張りを数え直す */
    const touch = () => {
      if (settled) return
      stopTimer()
      timer = setTimeout(() => {
        settle(() => reject(new NetworkError()))
        xhr.abort()
      }, stallMs)
    }

    xhr.upload.onprogress = (event) => {
      touch()
      if (!event.lengthComputable || event.total === 0) return
      options.onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    }
    xhr.upload.onload = touch
    xhr.onprogress = touch
    xhr.onreadystatechange = touch
    xhr.onload = () => {
      stopTimer()
      const text = typeof xhr.response === 'string' ? xhr.response : ''
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(text) as UploadPhotoResponse
          settle(() => {
            options.onProgress?.(100)
            resolve(body)
          })
        } catch (error) {
          settle(() => reject(new NetworkError(error)))
        }
        return
      }
      toApiError(new Response(text, { status: xhr.status })).then(
        (error) => settle(() => reject(error)),
        (error) => settle(() => reject(error)),
      )
    }
    xhr.onerror = () => settle(() => reject(new NetworkError()))
    xhr.ontimeout = () => settle(() => reject(new NetworkError()))
    xhr.onabort = () => settle(() => reject(new DOMException('aborted', 'AbortError')))
    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true })

    xhr.send(buildUploadForm(parts))
    touch()
  })
}
