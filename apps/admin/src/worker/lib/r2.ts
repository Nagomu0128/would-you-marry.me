// R2 のオブジェクトを返す・読み込む・消す
import { ApiError } from '@wym/shared'
import type { Context } from 'hono'
import { log } from './log'

export type ServeOptions = {
  contentType: string
  cacheControl: string
  /** 指定すると `Content-Disposition` を付ける（ダウンロード用） */
  contentDisposition?: string
}

/**
 * R2 からオブジェクトを返す。ETag を付け、`If-None-Match` が一致すれば 304 を返す。
 * HEAD のときは本文を読まずにメタデータだけを返す（画面が存在確認に使う）。
 * キーは呼び出し側が D1 の行から取ること（テナントの確認のため）。
 */
export async function serveR2Object(
  c: Context,
  bucket: R2Bucket,
  key: string,
  options: ServeOptions,
): Promise<Response> {
  const headers = new Headers({
    'Content-Type': options.contentType,
    'Cache-Control': options.cacheControl,
  })
  if (options.contentDisposition) headers.set('Content-Disposition', options.contentDisposition)

  if (c.req.method === 'HEAD') {
    const head = await bucket.head(key)
    if (!head) throw new ApiError('NOT_FOUND', 'file not found')
    headers.set('ETag', head.httpEtag)
    headers.set('Content-Length', String(head.size))
    return new Response(null, { headers })
  }

  const object = await bucket.get(key, { onlyIf: c.req.raw.headers })
  if (!object) throw new ApiError('NOT_FOUND', 'file not found')
  headers.set('ETag', object.httpEtag)
  // 条件が合わないとき（= 変更なし）は本文のない R2Object が返る
  if (!('body' in object)) return new Response(null, { status: 304, headers })
  headers.set('Content-Length', String(object.size))
  return new Response(object.body, { headers })
}

/**
 * 本文を上限つきで読む。上限を超えたら null を返し、残りは読まない。
 * Content-Length がない・偽っている場合に備える。
 */
export async function readBodyLimited(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0)
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/** R2 から消す。失敗しても処理は続け、ログに残す（テナントの削除時に一緒に消える） */
export async function deleteObjectsQuietly(
  bucket: R2Bucket,
  keys: string[],
  tenantId: string,
): Promise<void> {
  try {
    await bucket.delete(keys)
  } catch (error) {
    log('error', 'r2_delete_failed', {
      tenantId,
      count: keys.length,
      errorName: error instanceof Error ? error.name : 'unknown',
    })
  }
}
