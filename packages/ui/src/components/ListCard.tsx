import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'
import { ICON_STROKE_WIDTH } from './constants'
import { DefaultLink, type LinkComponent } from './link'

export type ListCardProps = {
  title: string
  /** 移動先。渡すとリンクになる。渡さないときはボタンになり、`onNavigate` だけを呼ぶ */
  href?: string
  LinkComponent?: LinkComponent
  /** 押したときに呼ぶ（リンクの移動の前） */
  onNavigate?: () => void
  /** タイトルの下に出す内容（件数、プレビューなど） */
  children?: ReactNode
  className?: string
}

const cardClass =
  'flex min-h-tap w-full items-center gap-3 rounded-card bg-surface p-4 text-left shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne'

/** ホームの入口カード。タイトル、右矢印、任意の中身。 */
export function ListCard({
  title,
  href,
  LinkComponent: Link = DefaultLink,
  onNavigate,
  children,
  className,
}: ListCardProps) {
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-heading-md text-charcoal">{title}</span>
        {children ? <span className="text-sub text-warm-gray">{children}</span> : null}
      </span>
      <ChevronRight
        aria-hidden="true"
        strokeWidth={ICON_STROKE_WIDTH}
        className="shrink-0 text-champagne"
      />
    </>
  )

  if (href !== undefined) {
    return (
      <Link href={href} className={cn(cardClass, className)} onClick={onNavigate}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" className={cn(cardClass, className)} onClick={onNavigate}>
      {body}
    </button>
  )
}
