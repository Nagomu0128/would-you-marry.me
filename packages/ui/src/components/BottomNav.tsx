import { House, Images, Plus, Users, UtensilsCrossed } from 'lucide-react'
import { m } from 'motion/react'
import type { ComponentType, SVGProps } from 'react'
import { ja } from '../messages/ja'
import { cn } from './cn'
import { DURATION } from './constants'
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
 * 和紙の帯に、現在地の上へ金の菱を置く。画面を移ると菱が横へ滑って移る（項目は等幅）。
 * 「投稿」は中央の朱の角印で目立たせる。現在地は菱・文字の太さ・色で示す（色だけにしない）。
 * 下はセーフエリア（ホームバー）を避ける。
 */
export function BottomNav({
  current,
  hrefs,
  LinkComponent: Link = DefaultLink,
  onNavigate,
  className,
}: BottomNavProps) {
  const currentIndex = items.findIndex((item) => item.key === current)
  return (
    <nav className={cn('wa-nav', className)} aria-label={ja.common.navLabel}>
      <div className="wa-nav-inner">
        <ul className="wa-nav-list">
          {items.map(({ key, label, Icon }) => (
            <li key={key}>
              <Link
                href={hrefs[key]}
                aria-current={current === key ? 'page' : undefined}
                onClick={() => onNavigate?.(key)}
                className="nav-item"
              >
                <span className={key === 'upload' ? 'nav-seal' : 'nav-icon'} aria-hidden="true">
                  <Icon strokeWidth={key === 'upload' ? 1.75 : 1.4} />
                </span>
                <span className="nav-label">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
        {currentIndex >= 0 ? (
          <m.span
            aria-hidden="true"
            className="nav-mark"
            initial={false}
            animate={{ x: `${currentIndex * 100}%` }}
            transition={{ duration: DURATION.slow, ease: [0.22, 0.61, 0.36, 1] }}
          />
        ) : null}
      </div>
    </nav>
  )
}
