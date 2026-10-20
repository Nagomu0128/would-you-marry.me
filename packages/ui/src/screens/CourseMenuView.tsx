import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '../components/cn'
import { ICON_STROKE_WIDTH } from '../components/constants'
import { EmptyState } from '../components/EmptyState'
import { ja } from '../messages/ja'
import { PinchZoom } from './PinchZoom'

export type CourseMenuViewImage = {
  id: string
  url: string
}

export type CourseMenuViewProps = {
  /** コース表の画像（登録順）。未登録なら空の配列 */
  images: readonly CourseMenuViewImage[]
  className?: string
}

/**
 * 料理のコース表。画像を登録順に縦に並べ、タップで全画面に拡大する（保存・いいねはなし）。
 * 拡大表示はピンチで拡大・移動できる。
 */
export function CourseMenuView({ images, className }: CourseMenuViewProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  if (images.length === 0) {
    return <EmptyState className={className} message={ja.guest.course.empty} />
  }

  const open = openIndex === null ? null : images[openIndex]

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {images.map((image, index) => (
        <button
          key={image.id}
          type="button"
          onClick={() => setOpenIndex(index)}
          className="block w-full overflow-hidden rounded-card bg-surface shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne"
        >
          <img
            src={image.url}
            alt={`${ja.guest.course.heading} ${index + 1}`}
            loading="lazy"
            decoding="async"
            className="block h-auto w-full"
          />
        </button>
      ))}
      {open ? (
        <Lightbox
          image={open}
          label={`${ja.guest.course.heading} ${(openIndex ?? 0) + 1}`}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </div>
  )
}

function Lightbox({
  image,
  label,
  onClose,
}: {
  image: CourseMenuViewImage
  label: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 bg-viewer"
    >
      <PinchZoom
        className="size-full"
        contentClassName="flex size-full items-center justify-center"
      >
        <img src={image.url} alt={label} draggable={false} className="max-h-full max-w-full" />
      </PinchZoom>
      <button
        type="button"
        onClick={onClose}
        aria-label={ja.common.back}
        className="safe-top absolute top-2 left-2 flex size-tap items-center justify-center rounded-full bg-charcoal/60 text-white focus-visible:outline-2 focus-visible:outline-champagne"
      >
        <X aria-hidden="true" strokeWidth={ICON_STROKE_WIDTH} />
      </button>
    </div>
  )
}
