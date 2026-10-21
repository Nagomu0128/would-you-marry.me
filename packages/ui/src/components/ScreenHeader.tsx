import { ChevronLeft } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
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
  eyebrow?: string
  description?: string
  className?: string
}

const backClass = 'header-back'

/** 上部のヘッダー。戻るボタンは「戻る」と読み上げる。上はセーフエリアを避ける。 */
export function ScreenHeader({
  title,
  backHref,
  LinkComponent: Link = DefaultLink,
  onBack,
  actions,
  className,
  eyebrow = 'The Wedding Journal',
  description,
}: ScreenHeaderProps) {
  useEffect(() => {
    if (title) document.title = `${title} | The Wedding Journal`
  }, [title])
  const icon = <ChevronLeft aria-hidden="true" strokeWidth={ICON_STROKE_WIDTH} />
  let back: ReactNode = null
  if (backHref !== undefined) {
    back = (
      <Link href={backHref} className={backClass} aria-label={ja.common.back} onClick={onBack}>
        {icon}
        <span>{ja.common.back}</span>
      </Link>
    )
  } else if (onBack) {
    back = (
      <button type="button" className={backClass} aria-label={ja.common.back} onClick={onBack}>
        {icon}
        <span>{ja.common.back}</span>
      </button>
    )
  }

  return (
    <header className={cn('screen-header px-screen', className)}>
      <div className="header-top">
        {back ?? (
          <span className="brand-monogram" aria-hidden="true">
            &
          </span>
        )}
        <p className="eyebrow text-muted" lang="en">
          {eyebrow}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="screen-title">{title}</h1>
        {actions}
      </div>
      {description ? <p className="screen-description">{description}</p> : null}
    </header>
  )
}
