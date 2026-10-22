import { X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../components/cn'
import { Dialog } from '../components/Dialog'
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
 * 料理のコース表。額装した御品書きの見立てで、画像を登録順に縦に並べる。
 * タップで全画面に拡大する（保存・いいねはなし）。拡大表示はピンチで拡大・移動できる。
 */
export function CourseMenuView({ images, className }: CourseMenuViewProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const open = openIndex === null ? null : images[openIndex]

  return (
    <div className={cn('document-frame', className)} data-empty={images.length === 0 || undefined}>
      <p className="frame-mark" aria-hidden="true">
        {ja.guest.course.mark}
      </p>
      {images.length === 0 ? (
        <EmptyState message={ja.guest.course.empty} ornament="mizuhiki" />
      ) : (
        <div className="document-gallery">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setOpenIndex(index)}
              className="document-sheet"
            >
              <img
                src={image.url}
                alt={ja.guest.course.imageAlt({ index: index + 1 })}
                loading="lazy"
                decoding="async"
              />
              <span className="document-caption" aria-hidden="true">
                <span className="font-numeral">
                  {index + 1} / {images.length}
                </span>
                <span>{ja.guest.course.zoomHint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {open ? (
        <Lightbox
          image={open}
          label={ja.guest.course.imageAlt({ index: (openIndex ?? 0) + 1 })}
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
  return (
    <Dialog fullScreen onClose={onClose} label={label}>
      <PinchZoom
        className="size-full"
        contentClassName="flex size-full items-center justify-center"
      >
        <img src={image.url} alt={label} draggable={false} className="viewer-image" />
      </PinchZoom>
      <button
        type="button"
        onClick={onClose}
        aria-label={ja.common.viewer.close}
        className="viewer-button lightbox-close"
        data-shape="round"
      >
        <X aria-hidden="true" strokeWidth={1.25} />
      </button>
    </Dialog>
  )
}
