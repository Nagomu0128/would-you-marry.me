import { House, Images, Plus, Users, UtensilsCrossed } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import { ja } from '../messages/ja'
import { cn } from './cn'
import { ICON_STROKE_WIDTH } from './constants'
import { DefaultLink, type LinkComponent } from './link'

export type BottomNavKey = 'home' | 'album' | 'upload' | 'seating' | 'course'

export type BottomNavProps = {
  /** 現在地。該当しない画面では渡さない */
  current?: BottomNavKey
  /** 各項目の移動先 */
  hrefs: Record<BottomNavKey, string>
  LinkComponent?: LinkComponent
  /** 項目を押したときに呼ぶ（リンクの移動の前） */
  onNavigate?: (key: BottomNavKey) => void
  className?: string
}

type IconType = ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>

const items: { key: BottomNavKey; label: string; Icon: IconType }[] = [
  { key: 'home', label: ja.common.nav.home, Icon: House },
  { key: 'album', label: ja.common.nav.album, Icon: Images },
  { key: 'upload', label: ja.common.nav.upload, Icon: Plus },
  { key: 'seating', label: ja.common.nav.seating, Icon: Users },
  { key: 'course', label: ja.common.nav.course, Icon: UtensilsCrossed },
]

/**
 * 画面下部に固定のナビゲーション。ホーム / アルバム / 投稿 / 席次表 / 料理。
 * 「投稿」は中央のインク色の印で目立たせる。現在地は文字の太さ・色と下の点で示す。
 * 下はセーフエリア（ホームバー）を避ける。最小高は 4.5rem + セーフエリア。
 */
export function BottomNav({
  current,
  hrefs,
  LinkComponent: Link = DefaultLink,
  onNavigate,
  className,
}: BottomNavProps) {
  return (
    <nav className={cn('journal-nav safe-x', className)} aria-label="メインメニュー">
      <ul className="layout-guest">
        {items.map(({ key, label, Icon }) => (
          <li key={key}>
            <Link
              href={hrefs[key]}
              aria-current={current === key ? 'page' : undefined}
              onClick={() => onNavigate?.(key)}
              className="nav-item"
            >
              <span className={key === 'upload' ? 'nav-upload-icon' : undefined}>
                <Icon aria-hidden="true" strokeWidth={ICON_STROKE_WIDTH} />
              </span>
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
