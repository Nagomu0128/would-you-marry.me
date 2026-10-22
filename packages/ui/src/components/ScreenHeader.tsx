import { ChevronLeft } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { ja } from '../messages/ja'
import { cn } from './cn'
import { DefaultLink, type LinkComponent } from './link'

export type ScreenHeaderProps = {
  /** 画面名（h1） */
  title: string
  /** 戻り先。渡すと戻るボタンをリンクで出す */
  backHref?: string
  LinkComponent?: LinkComponent
  /** 戻るボタンを押したときに呼ぶ。`backHref` がないときはボタンになる */
  onBack?: () => void
  /** 右端に置く操作（任意） */
  actions?: ReactNode
  /** 題の下に添える短い言葉（明朝） */
  description?: string
  className?: string
}

/**
 * 画面の表題。戻るは控えめな文字のリンク、題は明朝で、右へ金の細罫が伸びる（書物の柱の見立て）。
 * 戻るボタンは「戻る」と読み上げる。上はセーフエリアを避ける。
 */
export function ScreenHeader({
  title,
  backHref,
  LinkComponent: Link = DefaultLink,
  onBack,
  actions,
  className,
  description,
}: ScreenHeaderProps) {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
  const label = (
    <>
      <ChevronLeft aria-hidden="true" strokeWidth={1.4} />
      <span>{ja.common.back}</span>
    </>
  )
  let back: ReactNode = null
  if (backHref !== undefined) {
    back = (
      <Link href={backHref} className="header-back" onClick={onBack}>
        {label}
      </Link>
    )
  } else if (onBack) {
    back = (
      <button type="button" className="header-back" onClick={onBack}>
        {label}
      </button>
    )
  }

  return (
    <header className={cn('screen-header', className)}>
      {back || actions ? (
        <div className="header-bar">
          {back ?? <span />}
          {actions}
        </div>
      ) : null}
      <h1 className="screen-title">{title}</h1>
      {description ? <p className="screen-lead">{description}</p> : null}
    </header>
  )
}
