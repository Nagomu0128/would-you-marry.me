import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'
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

/** 帳面の一行のような入口。明朝の題、補足、右に細い矢印。行の間は罫で区切る。 */
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
      <span className="ui-list-body">
        <span className="ui-list-title">{title}</span>
        {children ? <span className="ui-list-note">{children}</span> : null}
      </span>
      <ChevronRight aria-hidden="true" strokeWidth={1.4} className="ui-list-arrow" />
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
