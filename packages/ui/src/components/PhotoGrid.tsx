import { Heart } from 'lucide-react'
import { m } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { ja } from '../messages/ja'
import { cn } from './cn'
import { DURATION, ICON_STROKE_WIDTH } from './constants'

export type PhotoGridItem = {
  id: string
  /** 一覧用の画像の URL */
  src: string
  nickname: string
  likeCount: number
  /** 自分がいいね済み。ハートを塗って区別する（色だけにしない） */
  liked?: boolean
}

export type PhotoGridProps = {
  photos: readonly PhotoGridItem[]
  /** 写真をタップしたとき */
  onSelect?: (photo: PhotoGridItem, index: number) => void
  /** 末尾が見えたとき（無限スクロール用）。次のページを読み込む */
  onReachEnd?: () => void
  className?: string
}

/**
 * 写真帖の一頁。3 列、4:5 の写真枠を、細い和紙の余白で区切って貼る。
 * 読み込めた写真から順にフェードインする。いいね数は写真の右下に小さく添える。
 */
export function PhotoGrid({ photos, onSelect, onReachEnd, className }: PhotoGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const onReachEndRef = useRef(onReachEnd)
  onReachEndRef.current = onReachEnd
  const observing = onReachEnd !== undefined
  const count = photos.length

  // biome-ignore lint/correctness/useExhaustiveDependencies: 写真が増えたら監視し直す（末尾が見えたままのとき次を読み込めるように）
  useEffect(() => {
    const node = sentinelRef.current
    if (!observing || !node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onReachEndRef.current?.()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [observing, count])

  return (
    <div className={className}>
      <ul className="photo-grid">
        {photos.map((photo, index) => (
          <li key={photo.id}>
            <PhotoTile photo={photo} eager={index < 6} onSelect={() => onSelect?.(photo, index)} />
          </li>
        ))}
      </ul>
      {observing ? <div ref={sentinelRef} aria-hidden="true" className="h-px" /> : null}
    </div>
  )
}

function PhotoTile({
  photo,
  eager,
  onSelect,
}: {
  photo: PhotoGridItem
  eager: boolean
  onSelect: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // キャッシュ済みの画像は onLoad が先に過ぎていることがある
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setLoaded(true)
  }, [])

  return (
    <button type="button" onClick={onSelect} data-photo-id={photo.id} className="photo-tile">
      <m.img
        ref={imgRef}
        src={photo.src}
        alt={ja.common.photoAlt({ nickname: photo.nickname })}
        loading={eager ? 'eager' : 'lazy'}
        width={400}
        height={500}
        decoding="async"
        onLoad={() => setLoaded(true)}
        initial={false}
        animate={{ opacity: loaded ? 1 : 0 }}
        transition={{ duration: DURATION.normal }}
        className="photo-image"
      />
      <span aria-hidden="true" className="photo-likes">
        <Heart
          size={12}
          strokeWidth={ICON_STROKE_WIDTH}
          className={cn('heart', photo.liked && 'is-filled fill-accent text-accent')}
        />
        {photo.likeCount}
      </span>
      <span className="sr-only-text">{ja.common.likeCount({ count: photo.likeCount })}</span>
    </button>
  )
}
