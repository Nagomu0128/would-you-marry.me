import type { Photo } from '@wym/shared'
import { ChevronLeft, ChevronRight, Download, Heart, X } from 'lucide-react'
import { m } from 'motion/react'
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { ja } from '../messages/ja'
import { LikeBurst } from '../motion/LikeBurst'
import { PinchZoom } from '../screens/PinchZoom'
import { ConfirmSheet } from './ConfirmSheet'
import { cn } from './cn'
import { DURATION, ICON_STROKE_WIDTH } from './constants'

export type PhotoViewerDeleteConfirm = {
  body: string
  confirm: string
  cancel: string
}

export type PhotoViewerProps<P extends Photo = Photo> = {
  /** 前後に移動できる写真（一覧と同じ並び） */
  photos: readonly P[]
  /** 表示中の写真の位置 */
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  /**
   * 保存（全員）。完了まで待つので、`usePhotoSave()` の関数を渡すと保存中は
   * ボタンを押せなくして読み込み中であることを示す
   */
  onSave: (photo: P) => void | Promise<void>
  /** いいね・取り消し（参加者だけ）。ない場合は、いいね数の表示だけ。見た目の更新（楽観的）は呼び出し側 */
  onToggleLike?: (photo: P) => void
  /** 削除できる写真か（参加者は自分の写真のみ、管理者はすべて、新郎新婦はなし） */
  canDelete?: (photo: P) => boolean
  /** 削除の実行。確認シートで確定したときに呼ぶ。消せたら true（閉じる）、失敗したら false（残す） */
  onDelete?: (photo: P) => Promise<boolean>
  /** 削除の確認の文言（既定は参加者向け。管理者は `ja.confirms.deletePhotoAdmin`） */
  deleteConfirm?: PhotoViewerDeleteConfirm
}

const SWIPE_DISTANCE = 60
const SWIPE_DOWN_DISTANCE = 90
/** 写真の周りのヘッダーとフッターの高さのおおよそ（開く動きの大きさの計算用） */
const CHROME_HEIGHT = 120

type Origin = { x: number; y: number; scale: number }

/** 一覧の写真の位置から広がり始める、最初の位置と大きさ */
function originOf(photo: Photo): Origin | null {
  if (typeof document === 'undefined') return null
  const tile = [...document.querySelectorAll<HTMLElement>('[data-photo-id]')].find(
    (node) => node.dataset.photoId === photo.id,
  )
  if (!tile) return null
  const rect = tile.getBoundingClientRect()
  if (rect.width === 0) return null
  const vw = window.innerWidth
  const vh = window.innerHeight
  const aspect = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1
  const fitWidth = Math.max(1, Math.min(vw, (vh - CHROME_HEIGHT) * aspect))
  return {
    x: rect.left + rect.width / 2 - vw / 2,
    y: rect.top + rect.height / 2 - vh / 2,
    scale: rect.width / fitWidth,
  }
}

/**
 * 写真の拡大表示（SG-06・SC-02・SA-07 で共通）。黒背景・全画面。
 * 役割ごとの違いは props で決める: `onToggleLike`（参加者だけ）、`canDelete` と `onDelete`、`onSave`（全員）。
 * 左右のスワイプ（矢印キー）で前後の写真、下へのスワイプ・× ・Esc で閉じる。ピンチで拡大できる。
 * 動きを減らす設定では、移動や拡大をやめてフェードだけにする（MotionConfig）。
 */
export function PhotoViewer<P extends Photo = Photo>({
  photos,
  index,
  onIndexChange,
  onClose,
  onSave,
  onToggleLike,
  canDelete,
  onDelete,
  deleteConfirm = ja.confirms.deletePhotoGuest,
}: PhotoViewerProps<P>) {
  const photo = photos[index]
  const rootRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [origin] = useState<Origin | null>(() => (photo ? originOf(photo) : null))
  const openedPhotoId = useRef(photo?.id)
  const direction = useRef(0)
  const zoomedRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [burstId, setBurstId] = useState<string | null>(null)
  const mounted = useRef(true)

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // 開いたら × にフォーカスを移し、閉じたら元の要素に戻す。背景のスクロールを止める
  useEffect(() => {
    mounted.current = true
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    rootRef.current?.showModal()
    closeRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      rootRef.current?.close()
      mounted.current = false
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])

  // 前後の写真を先に読み込んでおく
  useEffect(() => {
    for (const neighbor of [photos[index - 1], photos[index + 1]]) {
      if (neighbor) new Image().src = neighbor.urls.display
    }
  }, [photos, index])

  // 表示中の写真が一覧からなくなった（削除など）。位置が範囲外なら閉じる
  const exists = photo !== undefined
  useEffect(() => {
    if (!exists) onCloseRef.current()
  }, [exists])

  const go = useCallback(
    (step: -1 | 1) => {
      const next = index + step
      if (next < 0 || next >= photos.length) return
      direction.current = step
      zoomedRef.current = false
      onIndexChange(next)
    },
    [index, photos.length, onIndexChange],
  )

  // 左右のスワイプで前後、下へのスワイプで閉じる
  const pointers = useRef(new Set<number>())
  const gesture = useRef<{ x: number; y: number; multi: boolean } | null>(null)

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    pointers.current.add(event.pointerId)
    if (pointers.current.size > 1) {
      if (gesture.current) gesture.current.multi = true
      return
    }
    gesture.current = { x: event.clientX, y: event.clientY, multi: false }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size > 0) return
    const start = gesture.current
    gesture.current = null
    if (!start || start.multi || zoomedRef.current) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) {
      go(dx < 0 ? 1 : -1)
    } else if (dy >= SWIPE_DOWN_DISTANCE && dy > Math.abs(dx) * 1.5) {
      onClose()
    }
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size === 0) gesture.current = null
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    // 確認シートは別の場所に描かれる（イベントは React の木をさかのぼってくる）。中の操作は扱わない
    if (!rootRef.current?.contains(event.target as Node)) return
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    } else if (event.key === 'ArrowLeft') go(-1)
    else if (event.key === 'ArrowRight') go(1)
  }

  if (!photo) return null

  const liked = photo.likedByMe === true
  const showDelete = onDelete !== undefined && canDelete?.(photo) === true
  const alt = ja.common.photoAlt({ nickname: photo.uploader.nickname })
  const isOpenedPhoto = photo.id === openedPhotoId.current
  const initial =
    isOpenedPhoto && origin
      ? { x: origin.x, y: origin.y, scale: origin.scale, opacity: 1 }
      : { x: direction.current * 48, y: 0, scale: 1, opacity: 0 }

  async function handleSave() {
    if (saving || !photo) return
    setSaving(true)
    try {
      await onSave(photo)
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  function handleLike() {
    if (!photo || !onToggleLike) return
    setBurstId(liked ? null : photo.id)
    onToggleLike(photo)
  }

  async function handleDelete() {
    if (!photo || !onDelete || deleting) return
    setDeleting(true)
    const deleted = await onDelete(photo)
    if (!mounted.current) return
    setDeleting(false)
    setConfirming(false)
    if (deleted) onClose()
  }

  const iconButton =
    'flex min-h-tap min-w-tap items-center justify-center gap-2 rounded-control px-3 text-body text-white focus-visible:outline-2 focus-visible:outline-accent'

  return createPortal(
    <dialog
      ref={rootRef}
      aria-modal="true"
      aria-label={alt}
      onKeyDown={handleKeyDown}
      className="viewer-dialog"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="viewer-toolbar">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={ja.common.viewer.close}
          className={iconButton}
        >
          <X aria-hidden="true" strokeWidth={ICON_STROKE_WIDTH} />
        </button>
        <span className="viewer-count">
          {String(index + 1).padStart(2, '0')} / {String(photos.length).padStart(2, '0')}
        </span>
        <button
          type="button"
          onClick={handleSave}
          aria-disabled={saving}
          aria-busy={saving || undefined}
          className={cn(
            iconButton,
            saving && 'animate-pulse cursor-progress opacity-60 motion-reduce:animate-none',
          )}
        >
          <Download size={16} aria-hidden="true" />
          {ja.common.viewer.save}
        </button>
      </div>

      <div
        data-testid="viewer-stage"
        className="relative min-h-0 flex-1"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <button
          type="button"
          className="viewer-arrow"
          data-direction="previous"
          aria-label="前の写真"
          disabled={index === 0}
          onClick={() => go(-1)}
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          className="viewer-arrow"
          data-direction="next"
          aria-label="次の写真"
          disabled={index === photos.length - 1}
          onClick={() => go(1)}
        >
          <ChevronRight size={20} />
        </button>
        <m.div
          key={photo.id}
          className="absolute inset-0"
          initial={initial}
          animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          transition={{ duration: DURATION.slow, ease: 'easeOut' }}
        >
          <PinchZoom
            className="size-full"
            contentClassName="flex size-full items-center justify-center"
            idleTouchAction="none"
            onZoomChange={(next) => {
              zoomedRef.current = next
            }}
          >
            <img
              src={photo.urls.display}
              alt={alt}
              draggable={false}
              className="max-h-full max-w-full object-contain"
            />
          </PinchZoom>
        </m.div>
      </div>

      <div className="safe-bottom flex items-end justify-between gap-4 px-4 py-3">
        <p className="min-w-0 truncate text-body">
          {ja.common.uploader({ nickname: photo.uploader.nickname })}
        </p>
        <div className="flex flex-col items-end">
          {onToggleLike ? (
            <button
              type="button"
              onClick={handleLike}
              aria-pressed={liked}
              aria-label={liked ? ja.common.viewer.unlike : ja.common.viewer.like}
              className={cn(iconButton, 'relative')}
            >
              <Heart
                aria-hidden="true"
                strokeWidth={ICON_STROKE_WIDTH}
                className={cn(liked && 'fill-rose text-rose')}
              />
              <span aria-hidden="true">{photo.likeCount}</span>
              <LikeBurst
                active={burstId === photo.id && liked}
                onComplete={() => setBurstId(null)}
              />
            </button>
          ) : (
            <div className="flex min-h-tap items-center gap-2 px-3 text-body">
              <Heart aria-hidden="true" strokeWidth={ICON_STROKE_WIDTH} />
              <span aria-hidden="true">{photo.likeCount}</span>
            </div>
          )}
          <span className="sr-only-text" aria-live="polite">
            {ja.common.likeCount({ count: photo.likeCount })}
          </span>
          {showDelete ? (
            <button type="button" onClick={() => setConfirming(true)} className={iconButton}>
              {ja.common.viewer.delete}
            </button>
          ) : null}
        </div>
      </div>

      {showDelete ? (
        <ConfirmSheet
          open={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={handleDelete}
          body={deleteConfirm.body}
          confirmLabel={deleteConfirm.confirm}
          cancelLabel={deleteConfirm.cancel}
          danger
          loading={deleting}
        />
      ) : null}
    </dialog>,
    document.body,
  )
}
