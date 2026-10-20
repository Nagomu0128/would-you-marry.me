// 写真の保存（FR-G-11・NFR-25、architecture.md「写真の保存」）。参加者・新郎新婦・管理者で共通。
// オリジナル（位置情報は取り除き済み）を取得し、Web Share API の共有メニューで端末に保存する。
// 使えない端末では `?download=1` の URL でダウンロードし、アプリ内ブラウザでは案内を出す。

export type SavePhotoResult =
  /** 共有メニューを開いて共有（保存）した */
  | { status: 'shared' }
  /** 共有メニューをユーザーが閉じた（エラーにしない） */
  | { status: 'cancelled' }
  /** ダウンロードを始めた */
  | { status: 'downloaded' }
  /** アプリ内ブラウザなどで保存できない（「ブラウザで開く」を案内する） */
  | { status: 'unsupported' }
  /**
   * 取得は済んだが、タップの直後でなくなっていて共有メニューを開けなかった（iPhone の Safari の
   * `NotAllowedError`）。`file` を `savePhoto({ file })` に渡して、もう一度タップしたときに開く
   */
  | { status: 'needs-tap'; file: File }
  /** 取得できなかった（通信エラーなど） */
  | { status: 'failed' }

export type SavePhotoInput = {
  photoId: string
  /** オリジナル画像の URL（`photo.urls.original`） */
  originalUrl: string
  /** 前回 `needs-tap` で返したファイル。渡すと取得せずに共有メニューを開く */
  file?: File
}

// LINE・Instagram・Facebook・TikTok・Snapchat などのアプリ内ブラウザ
const IN_APP_BROWSER =
  /Line\/|Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Snapchat|MicroMessenger/i

export function isInAppBrowser(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): boolean {
  return IN_APP_BROWSER.test(userAgent)
}

export function downloadUrl(originalUrl: string): string {
  return `${originalUrl}${originalUrl.includes('?') ? '&' : '?'}download=1`
}

function fileName(photoId: string, type: string): string {
  return `wedding-photo-${photoId}.${type === 'image/png' ? 'png' : 'jpg'}`
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name: unknown }).name)
    : ''
}

/** 共有メニューでファイルを共有できる端末か（ファイルを取得する前に確かめる） */
function canShareFiles(probe: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [probe] })
  )
}

function startDownload(originalUrl: string, photoId: string) {
  const anchor = document.createElement('a')
  anchor.href = downloadUrl(originalUrl)
  anchor.download = fileName(photoId, 'image/jpeg')
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}

async function share(file: File): Promise<SavePhotoResult | 'error'> {
  try {
    await navigator.share({ files: [file] })
    return { status: 'shared' }
  } catch (error) {
    const name = errorName(error)
    if (name === 'AbortError') return { status: 'cancelled' }
    // fetch を待つ間にタップの直後という条件が切れた。取得済みのファイルで、もう一度タップしてもらう
    if (name === 'NotAllowedError') return { status: 'needs-tap', file }
    return 'error'
  }
}

/** 共有できなかったとき: アプリ内ブラウザでは案内、それ以外はダウンロード */
function fallback(input: SavePhotoInput): SavePhotoResult {
  if (isInAppBrowser()) return { status: 'unsupported' }
  startDownload(input.originalUrl, input.photoId)
  return { status: 'downloaded' }
}

/**
 * 写真を端末に保存する。結果の種類を返すので、呼び出し側（`usePhotoSave`）がトーストを出す。
 * - Web Share で共有できる端末: オリジナルを取得し、`navigator.share({ files })` で共有メニューを開く
 * - それ以外: アプリ内ブラウザなら `unsupported`、そうでなければダウンロード
 * - `needs-tap` が返ったら、同じ `file` を渡してもう一度呼ぶ（2 回目のタップで `share()` を呼ぶ）
 */
export async function savePhoto(input: SavePhotoInput): Promise<SavePhotoResult> {
  if (input.file) {
    const result = await share(input.file)
    return result === 'error' ? fallback(input) : result
  }

  const probe = new File([], fileName(input.photoId, 'image/jpeg'), { type: 'image/jpeg' })
  if (!canShareFiles(probe)) return fallback(input)

  let file: File
  try {
    const response = await fetch(input.originalUrl, { credentials: 'same-origin' })
    if (!response.ok) return { status: 'failed' }
    const blob = await response.blob()
    const type = blob.type || 'image/jpeg'
    file = new File([blob], fileName(input.photoId, type), { type })
  } catch {
    return { status: 'failed' }
  }

  if (!navigator.canShare({ files: [file] })) return fallback(input)
  const result = await share(file)
  return result === 'error' ? fallback(input) : result
}
