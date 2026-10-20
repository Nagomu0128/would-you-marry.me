// API のリクエスト・レスポンスの型（docs/spec/api.md）
// 画面とサーバーの両方でこの型を使う。見出しは api.md に対応する。
// 日時は ISO 8601 の文字列、開催日は `YYYY-MM-DD`。
// 画像・PDF などのバイナリを返す／受け取るエンドポイントは、本文の型を持たない。

import type { TenantPhase } from './periods'

// ---------------------------------------------------------------------------
// 共通の型（api.md「共通の型」）
// ---------------------------------------------------------------------------

/** 一覧のクエリ: `?cursor=<前回の nextCursor>&limit=<件数>`（limit は既定 30、最大 50） */
export type ListQuery = {
  cursor?: string
  limit?: number
}

export type TenantSummary = {
  id: string
  name: string
  eventDate: string // YYYY-MM-DD
  phase: TenantPhase
}

export type PhotoUrls = {
  thumb: string
  display: string
  original: string
}

/**
 * 写真。画面部品（packages/ui）が参加者向け・新郎新婦向け・管理者向けで共通に受け取れる上位の型。
 * `uploader.id` は参加者向けでは返さない。`likedByMe` / `isMine` は参加者向けのみ。
 * API の戻り値は、それぞれ厳密な `GuestPhoto` / `StaffPhoto` を使う。
 */
export type Photo = {
  id: string
  uploader: { id?: string; nickname: string }
  likeCount: number
  likedByMe?: boolean
  isMine?: boolean
  width: number // 拡大表示用画像の幅
  height: number
  createdAt: string
  urls: PhotoUrls
}

/** 参加者向けの写真（`uploader.id` なし、`likedByMe` と `isMine` あり） */
export type GuestPhoto = Omit<Photo, 'uploader' | 'likedByMe' | 'isMine'> & {
  uploader: { nickname: string }
  likedByMe: boolean
  isMine: boolean
}

/** 新郎新婦・管理者向けの写真（`uploader.id` あり、`likedByMe` と `isMine` なし） */
export type StaffPhoto = Omit<Photo, 'uploader' | 'likedByMe' | 'isMine'> & {
  uploader: { id: string; nickname: string }
}

/** 1 から順に振る（同数でも連番） */
export type RankedPhoto<P extends Photo = Photo> = P & { rank: number }

/** `{ photos, nextCursor }`。`nextCursor` が null なら最後まで取得済み */
export type PhotoListResponse<P extends Photo = Photo> = {
  photos: P[]
  nextCursor: string | null
}

/** ランキング（最大 10 件） */
export type RankingResponse<P extends Photo = Photo> = {
  photos: RankedPhoto<P>[]
}

// ---------------------------------------------------------------------------
// guest Worker: 参加者向け API（`/api/t/:tenantId`）
// ---------------------------------------------------------------------------

/** `GET /me`、`PUT /me/nickname` のレスポンス。`nickname` は未登録なら null */
export type GuestMeResponse = {
  tenant: TenantSummary
  me: {
    id: string
    nickname: string | null
    termsAgreed: boolean
    photoCount: number
    photoLimit: number
  }
}

/** `PUT /me/nickname` のリクエスト。`agreeToTerms` は初回の登録では true が必須 */
export type PutNicknameRequest = {
  nickname: string
  agreeToTerms?: boolean
}

/** `GET /photos` のクエリ。`mine=1` で自分の投稿のみ */
export type GuestPhotosQuery = ListQuery & { mine?: '1' }

/** `GET /photos`（新しい順） */
export type GuestPhotoListResponse = PhotoListResponse<GuestPhoto>

/** `GET /photos/ranking` */
export type GuestRankingResponse = RankingResponse<GuestPhoto>

/**
 * `POST /photos` の multipart/form-data の項目名。
 * original（JPEG / PNG、10MB まで）、display（JPEG、2MB まで）、thumb（JPEG、512KB まで）は File、
 * width / height（拡大表示用画像の幅・高さ）は整数を文字列で送る。
 */
export type UploadPhotoFields = {
  original: Blob
  display: Blob
  thumb: Blob
  width: string
  height: string
}

/** `POST /photos` のレスポンス（`201`） */
export type UploadPhotoResponse = { photo: GuestPhoto }

/** `PUT` / `DELETE /photos/:photoId/like` のレスポンス */
export type LikeResponse = {
  likeCount: number
  likedByMe: boolean
}

/** コース表の画像 */
export type CourseMenuImage = {
  id: string
  url: string
}

/** `GET /course-menu`（参加者向け）、`GET /api/tenants/:tenantId/course-menu`（管理者向け） */
export type CourseMenuResponse = {
  images: CourseMenuImage[]
}

// `GET /seating-chart`、`GET /course-menu/images/:imageId`、`GET /photos/:photoId/thumb|display|original`
// は PDF・画像そのものを返す（本文の型なし）。`original` は `?download=1` でダウンロード。

// ---------------------------------------------------------------------------
// guest Worker: 新郎新婦向け API（`/api/couple/:tenantId`）
// ---------------------------------------------------------------------------

/** `GET /login` のレスポンス */
export type CoupleLoginStateResponse = {
  tenantName: string
  needsTermsAgreement: boolean
}

/** `POST /login` のリクエスト。初回は `agreeToTerms: true` が必須 */
export type CoupleLoginRequest = {
  passcode: string
  agreeToTerms?: boolean
}

/** `POST /login` のレスポンス（`200`。本文は空のオブジェクト） */
export type CoupleLoginResponse = Record<string, never>

/** `GET /me`（結婚式の情報） */
export type CoupleMeResponse = {
  tenant: TenantSummary
}

/** `GET /photos` のクエリ。`uploaderId` で投稿者を絞り込む */
export type CouplePhotosQuery = ListQuery & { uploaderId?: string }

/** `GET /photos` */
export type CouplePhotoListResponse = PhotoListResponse<StaffPhoto>

/** `GET /photos/ranking` */
export type CoupleRankingResponse = RankingResponse<StaffPhoto>

export type Uploader = {
  id: string
  nickname: string
  photoCount: number
}

/** `GET /uploaders`（ニックネーム順。写真を投稿していない参加者は含まない） */
export type UploadersResponse = {
  uploaders: Uploader[]
}

// ---------------------------------------------------------------------------
// 共通: `GET /api/config`
// ---------------------------------------------------------------------------

export type ConfigResponse = {
  contactEmail: string
}

// ---------------------------------------------------------------------------
// admin Worker（`/api/*`、`/api/auth/*` は Better Auth）
// ---------------------------------------------------------------------------

/** `GET /api/me`（ログイン中の管理者。api.md に形の記載がないため最小限） */
export type AdminMeResponse = {
  email: string
  name: string | null
}

export type TenantStats = {
  guestCount: number
  photoCount: number
  likeCount: number
  storageBytes: number
}

/** `GET /api/tenants` の各テナント（利用状況付き） */
export type AdminTenant = TenantSummary & {
  suspended: boolean
  createdAt: string
  dataDeletedAt: string | null
  stats: TenantStats
}

/** `GET /api/tenants`（開催日の新しい順） */
export type AdminTenantListResponse = {
  tenants: AdminTenant[]
}

/** 期間の境界（ISO 8601、UTC 表記） */
export type TenantBoundaries = {
  joiningStart: string
  viewingStart: string
  coupleOnlyStart: string
  deletionAt: string
}

/** `POST /api/tenants` のリクエスト */
export type CreateTenantRequest = {
  name: string
  eventDate: string
}

/** `POST /api/tenants`（`201`）、`PATCH /api/tenants/:tenantId` のレスポンス */
export type AdminTenantResponse = {
  tenant: AdminTenant
}

/** `GET /api/tenants/:tenantId` */
export type AdminTenantDetailResponse = {
  tenant: AdminTenant
  boundaries: TenantBoundaries
}

/** `PATCH /api/tenants/:tenantId`（どの項目も省略できる） */
export type UpdateTenantRequest = {
  name?: string
  eventDate?: string
  suspended?: boolean
}

/** `POST /api/tenants/:tenantId/deletion`（成功は `204`） */
export type DeleteTenantRequest = {
  confirmName: string
}

/** `PUT /api/tenants/:tenantId/seating-chart`（本文は PDF そのもの）のレスポンス */
export type SeatingChartResponse = {
  sizeBytes: number
  uploadedAt: string
}

// `GET /api/tenants/:tenantId/seating-chart` は PDF そのものを返す（本文の型なし）。

/** `POST /api/tenants/:tenantId/course-menu/images`（`201`。リクエストは multipart の `file`） */
export type AddCourseMenuImageResponse = {
  image: CourseMenuImage
}

/** `PUT /api/tenants/:tenantId/course-menu/order`（すべての画像 ID を表示順に） */
export type ReorderCourseMenuRequest = {
  imageIds: string[]
}

/** `GET` / `POST /api/tenants/:tenantId/join-url`。未発行なら GET は `{ url: null }` */
export type JoinUrlResponse =
  | { url: null }
  | {
      url: string
      issuedAt: string
      joiningStart: string
      joiningEnd: string
    }

/** `GET /api/tenants/:tenantId/couple-access`（パスコードは返さない。未発行は `{ url: null }`） */
export type CoupleAccessResponse =
  | { url: null }
  | {
      url: string
      issuedAt: string
      termsAgreedAt: string | null
    }

/** `POST /api/tenants/:tenantId/couple-access`（パスコードはこのレスポンスでだけ返す） */
export type IssueCoupleAccessResponse = {
  url: string
  passcode: string
  issuedAt: string
}

/** `GET /api/tenants/:tenantId/photos` のクエリ */
export type AdminPhotosQuery = ListQuery

/** `GET /api/tenants/:tenantId/photos`（`DELETE .../photos/:photoId` の成功は `204`） */
export type AdminPhotoListResponse = PhotoListResponse<StaffPhoto>

/** ニックネーム登録済みの参加者だけを返す */
export type AdminGuest = {
  id: string
  nickname: string
  photoCount: number
  createdAt: string
}

/** `GET /api/tenants/:tenantId/guests` */
export type AdminGuestListResponse = {
  guests: AdminGuest[]
}

/** `PATCH /api/tenants/:tenantId/guests/:guestId` */
export type UpdateGuestRequest = {
  nickname: string
}
