// 写真の JSON への変換（URL の組み立てを含む）。
// 参加者向け（T08）と新郎新婦向け（T09）で共通に使う。
import type { Photo, PhotoWithUploader } from '@wym/db'
import type { GuestPhoto, PhotoUrls, RankedPhoto, StaffPhoto } from '@wym/shared'

/**
 * 画像の URL。`basePath` は API のルート（末尾のスラッシュなし）。
 * 参加者向け: `/api/t/{tenantId}`、新郎新婦向け: `/api/couple/{tenantId}`
 */
export function photoUrls(basePath: string, photoId: string): PhotoUrls {
  const base = `${basePath}/photos/${photoId}`
  return { thumb: `${base}/thumb`, display: `${base}/display`, original: `${base}/original` }
}

type PhotoBase = Omit<StaffPhoto, 'uploader'>

function toPhotoBase(photo: Photo, basePath: string): PhotoBase {
  return {
    id: photo.id,
    likeCount: photo.likeCount,
    width: photo.width,
    height: photo.height,
    createdAt: new Date(photo.createdAt).toISOString(),
    urls: photoUrls(basePath, photo.id),
  }
}

export type GuestPhotoContext = {
  basePath: string
  /** 閲覧している参加者の ID（isMine の判定用） */
  guestId: string
  /** 閲覧している参加者がいいね済みの写真 ID */
  likedPhotoIds: ReadonlySet<string>
}

/** 参加者向け: `uploader.id` は返さない。`likedByMe`・`isMine` を付ける */
export function toGuestPhoto(row: PhotoWithUploader, context: GuestPhotoContext): GuestPhoto {
  return {
    ...toPhotoBase(row.photo, context.basePath),
    uploader: { nickname: row.uploader.nickname ?? '' },
    likedByMe: context.likedPhotoIds.has(row.photo.id),
    isMine: row.photo.guestId === context.guestId,
  }
}

/** 新郎新婦・管理者向け: `uploader.id` を返す。`likedByMe`・`isMine` は付けない */
export function toStaffPhoto(row: PhotoWithUploader, basePath: string): StaffPhoto {
  return {
    ...toPhotoBase(row.photo, basePath),
    uploader: { id: row.uploader.id, nickname: row.uploader.nickname ?? '' },
  }
}

/** ランキング用。`rank` は 1 から順に振る（同数でも連番） */
export function withRanks<P extends GuestPhoto | StaffPhoto>(photos: P[]): RankedPhoto<P>[] {
  return photos.map((photo, index) => ({ ...photo, rank: index + 1 }))
}
