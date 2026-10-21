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

const cardClass = 'ui-list-card'

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
        <span className="ui-list-title">{title}</span>
        {children ? <span className="text-sub text-muted">{children}</span> : null}
      </span>
      <ChevronRight
        aria-hidden="true"
        strokeWidth={ICON_STROKE_WIDTH}
        className="shrink-0 text-accent"
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
