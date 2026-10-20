// R2 のオブジェクトを返す（docs/spec/api.md「画像の取得」）
import { ApiError } from '@wym/shared'
import type { Context } from 'hono'

export type ServeOptions = {
  contentType: string
  cacheControl: string
}

/**
 * R2 からオブジェクトを読み出して返す。ETag を付け、`If-None-Match` が一致すれば 304 を返す。
 * オブジェクトがなければ NOT_FOUND。キーは呼び出し側が D1 の行から取ること（テナントの確認のため）。
 */
export async function serveR2Object(
  c: Context,
  bucket: R2Bucket,
  key: string,
  options: ServeOptions,
): Promise<Response> {
  const object = await bucket.get(key, { onlyIf: c.req.raw.headers })
  if (!object) throw new ApiError('NOT_FOUND', 'file not found')

  const headers = new Headers({
    'Content-Type': options.contentType,
    'Cache-Control': options.cacheControl,
    ETag: object.httpEtag,
  })
  // 条件が合わないとき（= 変更なし）は本文のない R2Object が返る
  if (!('body' in object)) return new Response(null, { status: 304, headers })
  headers.set('Content-Length', String(object.size))
  return new Response(object.body, { headers })
}
