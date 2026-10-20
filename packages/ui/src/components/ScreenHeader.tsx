import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { ja } from '../messages/ja'
import { cn } from './cn'
import { ICON_STROKE_WIDTH } from './constants'
import { DefaultLink, type LinkComponent } from './link'

export type ScreenHeaderProps = {
  /** 画面名（ホームではテナント名） */
  title: string
  /** 戻り先。渡すと戻るボタンをリンクで出す */
  backHref?: string
  LinkComponent?: LinkComponent
  /** 戻るボタンを押したときに呼ぶ。`backHref` がないときはボタンになる */
  onBack?: () => void
  /** 右端に置く操作（任意） */
  actions?: ReactNode
  className?: string
}

const backClass =
  '-ml-2 flex size-tap shrink-0 items-center justify-center rounded-control text-charcoal focus-visible:outline-2 focus-visible:outline-champagne'

/** 上部のヘッダー。戻るボタンは「戻る」と読み上げる。上はセーフエリアを避ける。 */
export function ScreenHeader({
  title,
  backHref,
  LinkComponent: Link = DefaultLink,
  onBack,
  actions,
  className,
}: ScreenHeaderProps) {
  const icon = <ChevronLeft aria-hidden="true" strokeWidth={ICON_STROKE_WIDTH} />
  let back: ReactNode = null
  if (backHref !== undefined) {
    back = (
      <Link href={backHref} className={backClass} aria-label={ja.common.back} onClick={onBack}>
        {icon}
      </Link>
    )
  } else if (onBack) {
    back = (
      <button type="button" className={backClass} aria-label={ja.common.back} onClick={onBack}>
        {icon}
      </button>
    )
  }

  return (
    <header className={cn('safe-top px-screen', className)}>
      <div className="flex min-h-14 items-center gap-2">
        {back}
        <h1 className="min-w-0 flex-1 truncate text-heading-md text-charcoal">{title}</h1>
        {actions}
      </div>
    </header>
  )
}
