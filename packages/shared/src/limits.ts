// 上限値・設定値（仮置きを含む）。値を変えるときはここだけを直す

// --- ニックネーム・テナント名 ---
/** ニックネームの最大文字数（書記素クラスタ単位） */
export const NICKNAME_MAX_LENGTH = 20
/** テナント名の最大文字数（仮置き） */
export const TENANT_NAME_MAX_LENGTH = 50

// --- 画像 ---
export const KB = 1024
export const MB = 1024 * 1024
/** オリジナル画像の最大サイズ（JPEG / PNG） */
export const ORIGINAL_MAX_BYTES = 10 * MB
/** 拡大表示用画像の最大サイズ（JPEG） */
export const DISPLAY_MAX_BYTES = 2 * MB
/** 拡大表示用画像の長辺（px） */
export const DISPLAY_MAX_EDGE_PX = 1600
/** 一覧用画像の最大サイズ（JPEG） */
export const THUMB_MAX_BYTES = 512 * KB
/** 一覧用画像の長辺（px） */
export const THUMB_MAX_EDGE_PX = 480
/** 1 人あたりの投稿枚数の上限 */
export const PHOTO_LIMIT_PER_GUEST = 100

// --- 一覧 ---
/** ランキングの件数 */
export const RANKING_SIZE = 10
/** 一覧の limit の既定値 */
export const LIST_LIMIT_DEFAULT = 30
/** 一覧の limit の最大値 */
export const LIST_LIMIT_MAX = 50
/** ホームに出す新着写真の枚数 */
export const HOME_RECENT_PHOTO_COUNT = 3

// --- 管理者がアップロードするファイル ---
/** 席次表 PDF の最大サイズ */
export const SEATING_CHART_MAX_BYTES = 20 * MB
/** コース表の画像の最大サイズ（JPEG / PNG） */
export const COURSE_MENU_IMAGE_MAX_BYTES = 10 * MB

// --- 新郎新婦のパスコード ---
/** パスコードの文字数（仮置き） */
export const PASSCODE_LENGTH = 8
/** この回数連続で失敗するとロックする（仮置き） */
export const PASSCODE_MAX_FAILED_ATTEMPTS = 5
/** ロックの長さ（ミリ秒、仮置き） */
export const PASSCODE_LOCK_MS = 15 * 60 * 1000

// --- レート制限 ---
/** 参加 URL のレート制限: 同じ IP アドレスから 1 窓あたりの回数（D-38） */
export const JOIN_RATE_LIMIT_MAX = 200
/** 参加 URL のレート制限の窓（ミリ秒、D-38） */
export const JOIN_RATE_LIMIT_WINDOW_MS = 60 * 1000

// --- セッション・Cookie ---
/** `guests.last_seen_at` の更新間隔（ミリ秒、仮置き） */
export const LAST_SEEN_UPDATE_INTERVAL_MS = 10 * 60 * 1000
/** セッション Cookie の Max-Age（秒、400 日） */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60
/** `wym_couple_pending` の Max-Age（秒、15 分） */
export const COUPLE_PENDING_COOKIE_MAX_AGE_SECONDS = 15 * 60

// --- 画面 ---
/** トーストの表示時間（ミリ秒） */
export const TOAST_DURATION_MS = 3000
