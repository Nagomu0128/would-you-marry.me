// 写真 API（FR-G-07〜FR-G-13）。パスは /api/t/:tenantId/photos 以下
import {
  countGuestPhotos,
  deleteOwnPhoto,
  getLikedPhotoIds,
  getPhoto,
  InvalidCursorError,
  insertPhotoWithLimit,
  likePhoto,
  listRanking,
  listTimeline,
  newId,
  type Photo,
  type PhotoWithUploader,
  photoKeys,
  unlikePhoto,
} from '@wym/db'
import {
  ApiError,
  DISPLAY_MAX_BYTES,
  type ErrorFields,
  type GuestPhotoListResponse,
  type GuestRankingResponse,
  LIST_LIMIT_DEFAULT,
  LIST_LIMIT_MAX,
  type LikeResponse,
  ORIGINAL_MAX_BYTES,
  PHOTO_LIMIT_PER_GUEST,
  RANKING_SIZE,
  THUMB_MAX_BYTES,
  type UploadPhotoResponse,
} from '@wym/shared'
import { type Context, Hono } from 'hono'
import { detectImageType } from '../lib/image-type'
import { logEvent } from '../lib/logger'
import { toGuestPhoto, withRanks } from '../lib/photo-dto'
import { isPhotoVariant, servePhotoImage } from '../lib/photo-image'
import { InvalidImageError, stripJpegMetadata, stripMetadata } from '../lib/strip-metadata'
import type { GuestEnv } from '../types'

export const photoRoutes = new Hono<GuestEnv>()

/** この API のルート（画像の URL の組み立てに使う） */
function basePath(c: Context<GuestEnv>): string {
  return `/api/t/${c.var.tenant.id}`
}

/** 本文の大きさの目安。3 つのファイルの上限の合計に、multipart の枠と width/height の分を足す */
const REQUEST_BODY_MAX_BYTES =
  ORIGINAL_MAX_BYTES + DISPLAY_MAX_BYTES + THUMB_MAX_BYTES + 1024 * 1024

/** 参加者に見せる形へ変換する（いいね済みの判定を 1 回のクエリでまとめて行う） */
async function toGuestPhotos(
  c: Context<GuestEnv>,
  rows: PhotoWithUploader[],
): Promise<ReturnType<typeof toGuestPhoto>[]> {
  const { db, tenant, guest } = c.var
  const likedPhotoIds = await getLikedPhotoIds(
    db,
    tenant.id,
    guest.id,
    rows.map((row) => row.photo.id),
  )
  const context = { basePath: basePath(c), guestId: guest.id, likedPhotoIds }
  return rows.map((row) => toGuestPhoto(row, context))
}

// ------------------------------------------------------------ 一覧・ランキング

/** GET /photos?cursor=&limit=&mine=1 */
photoRoutes.get('/', async (c) => {
  const { db, tenant, guest } = c.var
  const limitText = c.req.query('limit')
  let limit = LIST_LIMIT_DEFAULT
  if (limitText !== undefined) {
    const parsed = /^\d+$/.test(limitText) ? Number(limitText) : Number.NaN
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > LIST_LIMIT_MAX) {
      throw new ApiError('VALIDATION_ERROR', 'invalid limit', { fields: { limit: 'INVALID' } })
    }
    limit = parsed
  }
  const mine = c.req.query('mine') === '1'

  let page: Awaited<ReturnType<typeof listTimeline>>
  try {
    page = await listTimeline(db, tenant.id, {
      cursor: c.req.query('cursor'),
      limit,
      guestId: mine ? guest.id : undefined,
    })
  } catch (err) {
    if (err instanceof InvalidCursorError) {
      throw new ApiError('VALIDATION_ERROR', 'invalid cursor', { fields: { cursor: 'INVALID' } })
    }
    throw err
  }
  const body: GuestPhotoListResponse = {
    photos: await toGuestPhotos(c, page.photos),
    nextCursor: page.nextCursor,
  }
  return c.json(body)
})

/** GET /photos/ranking */
photoRoutes.get('/ranking', async (c) => {
  const rows = await listRanking(c.var.db, c.var.tenant.id, RANKING_SIZE)
  const body: GuestRankingResponse = { photos: withRanks(await toGuestPhotos(c, rows)) }
  return c.json(body)
})

// ------------------------------------------------------------ アップロード

function requireFile(form: FormData, name: string, fields: ErrorFields): File | undefined {
  const value = form.get(name)
  if (!(value instanceof File)) {
    fields[name] = 'REQUIRED'
    return undefined
  }
  return value
}

function parsePositiveInt(form: FormData, name: string, fields: ErrorFields): number | undefined {
  const value = form.get(name)
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    fields[name] = 'INVALID'
    return undefined
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    fields[name] = 'INVALID'
    return undefined
  }
  return parsed
}

/** 表示用・一覧用は JPEG のみ。形式を確かめ、メタデータを取り除く */
function prepareJpeg(bytes: Uint8Array, maxBytes: number): Uint8Array {
  if (detectImageType(bytes) !== 'jpeg') {
    throw new ApiError('UNSUPPORTED_FILE_TYPE', 'only jpeg is accepted')
  }
  if (bytes.byteLength > maxBytes) throw new ApiError('FILE_TOO_LARGE', 'file too large')
  try {
    return stripJpegMetadata(bytes)
  } catch (err) {
    if (err instanceof InvalidImageError) {
      throw new ApiError('UNSUPPORTED_FILE_TYPE', 'invalid image')
    }
    throw err
  }
}

/** POST /photos（multipart/form-data） */
photoRoutes.post('/', async (c) => {
  const { db, tenant, guest } = c.var

  // 1. 本文が大きすぎるものは、解析する前に断る
  const contentLength = Number(c.req.header('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > REQUEST_BODY_MAX_BYTES) {
    throw new ApiError('FILE_TOO_LARGE', 'request body too large')
  }

  // 2. 投稿枚数（最終的な判定は登録時の insertPhotoWithLimit。ここは無駄な処理を省く早期判定）
  if ((await countGuestPhotos(db, tenant.id, guest.id)) >= PHOTO_LIMIT_PER_GUEST) {
    throw new ApiError('UPLOAD_LIMIT_REACHED', 'upload limit reached')
  }

  // 3. 項目
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'invalid multipart body')
  }
  const fields: ErrorFields = {}
  const originalFile = requireFile(form, 'original', fields)
  const displayFile = requireFile(form, 'display', fields)
  const thumbFile = requireFile(form, 'thumb', fields)
  const width = parsePositiveInt(form, 'width', fields)
  const height = parsePositiveInt(form, 'height', fields)
  if (
    !originalFile ||
    !displayFile ||
    !thumbFile ||
    width === undefined ||
    height === undefined ||
    Object.keys(fields).length > 0
  ) {
    throw new ApiError('VALIDATION_ERROR', 'invalid fields', { fields })
  }

  // 4. 形式（先頭のバイト列）とサイズ。5. メタデータの除去（再圧縮はしない）
  const [originalBytes, displayBytes, thumbBytes] = await Promise.all([
    originalFile.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
    displayFile.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
    thumbFile.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
  ])
  const originalType = detectImageType(originalBytes)
  if (originalType !== 'jpeg' && originalType !== 'png') {
    throw new ApiError('UNSUPPORTED_FILE_TYPE', 'only jpeg and png are accepted')
  }
  if (originalBytes.byteLength > ORIGINAL_MAX_BYTES) {
    throw new ApiError('FILE_TOO_LARGE', 'original too large')
  }
  const display = prepareJpeg(displayBytes, DISPLAY_MAX_BYTES)
  const thumb = prepareJpeg(thumbBytes, THUMB_MAX_BYTES)
  let original: ReturnType<typeof stripMetadata>
  try {
    original = stripMetadata(originalBytes)
  } catch (err) {
    if (err instanceof InvalidImageError) {
      throw new ApiError('UNSUPPORTED_FILE_TYPE', 'invalid image')
    }
    throw err
  }

  // 6. R2 に保存する。途中で失敗したら保存済みのものを消す
  const photoId = newId()
  const keys = photoKeys(tenant.id, photoId, original.contentType)
  const allKeys = [keys.original, keys.display, keys.thumb]
  const discardStored = async () => {
    try {
      await c.env.BUCKET.delete(allKeys)
    } catch (err) {
      logEvent(
        'photo_cleanup_failed',
        { tenantId: tenant.id, errorName: err instanceof Error ? err.name : 'unknown' },
        'error',
      )
    }
  }
  const stored = await Promise.allSettled([
    c.env.BUCKET.put(keys.original, original.bytes, {
      httpMetadata: { contentType: original.contentType },
    }),
    c.env.BUCKET.put(keys.display, display, { httpMetadata: { contentType: 'image/jpeg' } }),
    c.env.BUCKET.put(keys.thumb, thumb, { httpMetadata: { contentType: 'image/jpeg' } }),
  ])
  if (stored.some((result) => result.status === 'rejected')) {
    await discardStored()
    throw new ApiError('INTERNAL_ERROR', 'failed to store images')
  }

  // 7. 上限を確かめながら D1 に登録する
  const storedSizeBytes = original.bytes.byteLength + display.byteLength + thumb.byteLength
  let result: Awaited<ReturnType<typeof insertPhotoWithLimit>>
  try {
    result = await insertPhotoWithLimit(
      db,
      tenant.id,
      {
        id: photoId,
        guestId: guest.id,
        originalKey: keys.original,
        displayKey: keys.display,
        thumbKey: keys.thumb,
        originalContentType: original.contentType,
        storedSizeBytes,
        width,
        height,
      },
      PHOTO_LIMIT_PER_GUEST,
    )
  } catch (err) {
    await discardStored()
    throw err
  }
  if (!result.inserted) {
    await discardStored()
    throw new ApiError('UPLOAD_LIMIT_REACHED', 'upload limit reached')
  }

  // 8. 応答
  logEvent('photo_uploaded', { tenantId: tenant.id, status: 201 })
  const [photo] = await toGuestPhotos(c, [{ photo: result.photo, uploader: guestUploader(c) }])
  if (!photo) throw new ApiError('INTERNAL_ERROR', 'failed to build response')
  const body: UploadPhotoResponse = { photo }
  return c.json(body, 201)
})

function guestUploader(c: Context<GuestEnv>): PhotoWithUploader['uploader'] {
  const { guest } = c.var
  return { id: guest.id, nickname: guest.nickname }
}

// ------------------------------------------------------------ 削除・いいね

/** R2 の 3 つの画像を消す。失敗はログに残す（非公開で、テナントの削除時に一緒に消える） */
async function deleteStoredImages(bucket: R2Bucket, tenantId: string, photo: Photo) {
  try {
    await bucket.delete([photo.originalKey, photo.displayKey, photo.thumbKey])
  } catch (err) {
    logEvent(
      'photo_r2_delete_failed',
      { tenantId, errorName: err instanceof Error ? err.name : 'unknown' },
      'error',
    )
  }
}

/** DELETE /photos/:photoId */
photoRoutes.delete('/:photoId', async (c) => {
  const { db, tenant, guest } = c.var
  const photoId = c.req.param('photoId')
  const deleted = await deleteOwnPhoto(db, tenant.id, guest.id, photoId)
  if (!deleted) {
    // 同じテナントの他人の写真か、そもそもないか
    const existing = await getPhoto(db, tenant.id, photoId)
    if (existing) throw new ApiError('FORBIDDEN', 'not your photo')
    throw new ApiError('NOT_FOUND', 'photo not found')
  }
  c.executionCtx.waitUntil(deleteStoredImages(c.env.BUCKET, tenant.id, deleted))
  return c.body(null, 204)
})

/** PUT /photos/:photoId/like */
photoRoutes.put('/:photoId/like', async (c) => {
  const { db, tenant, guest } = c.var
  const state = await likePhoto(db, tenant.id, guest.id, c.req.param('photoId'))
  if (!state) throw new ApiError('NOT_FOUND', 'photo not found')
  const body: LikeResponse = state
  return c.json(body)
})

/** DELETE /photos/:photoId/like */
photoRoutes.delete('/:photoId/like', async (c) => {
  const { db, tenant, guest } = c.var
  const state = await unlikePhoto(db, tenant.id, guest.id, c.req.param('photoId'))
  if (!state) throw new ApiError('NOT_FOUND', 'photo not found')
  const body: LikeResponse = state
  return c.json(body)
})

// ------------------------------------------------------------ 画像

/** GET /photos/:photoId/(thumb|display|original) */
photoRoutes.get('/:photoId/:variant', async (c) => {
  const variant = c.req.param('variant')
  if (!isPhotoVariant(variant)) throw new ApiError('NOT_FOUND', 'not found')
  // tenant_id で絞り込む。他のテナントの写真は存在しないものとして扱う
  const photo = await getPhoto(c.var.db, c.var.tenant.id, c.req.param('photoId'))
  if (!photo) throw new ApiError('NOT_FOUND', 'photo not found')
  return servePhotoImage(c, c.env.BUCKET, photo, variant, {
    download: c.req.query('download') === '1',
  })
})
