// 写真の画像（thumb / display / original）を R2 から返す。参加者向け・新郎新婦向けで共通
import type { Photo } from '@wym/db'
import type { Context } from 'hono'
import { serveR2Object } from './r2'

export const PHOTO_VARIANTS = ['thumb', 'display', 'original'] as const
export type PhotoVariant = (typeof PHOTO_VARIANTS)[number]

export function isPhotoVariant(value: string): value is PhotoVariant {
  return (PHOTO_VARIANTS as readonly string[]).includes(value)
}

/** 画像の中身は変わらないので長くキャッシュする */
export const PHOTO_CACHE_CONTROL = 'private, max-age=31536000, immutable'

/**
 * 写真の画像を返す。`photo` は tenant_id で絞り込んで取得した行であること（呼び出し側の責任）。
 * `download` が true の original には `Content-Disposition: attachment` を付ける
 * （拡張子は実際の形式に合わせる）。
 */
export async function servePhotoImage(
  c: Context,
  bucket: R2Bucket,
  photo: Photo,
  variant: PhotoVariant,
  options: { download?: boolean } = {},
): Promise<Response> {
  const key =
    variant === 'original'
      ? photo.originalKey
      : variant === 'display'
        ? photo.displayKey
        : photo.thumbKey
  const contentType = variant === 'original' ? photo.originalContentType : 'image/jpeg'
  const response = await serveR2Object(c, bucket, key, {
    contentType,
    cacheControl: PHOTO_CACHE_CONTROL,
  })
  if (variant === 'original' && options.download) {
    const extension = photo.originalContentType === 'image/png' ? 'png' : 'jpg'
    response.headers.set(
      'Content-Disposition',
      `attachment; filename="wedding-photo-${photo.id}.${extension}"`,
    )
  }
  return response
}
