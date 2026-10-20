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
 * 「投稿」は中央で丸く目立たせる。現在地は文字の太さ・色と上の線で示す（色だけにしない）。
 * 下はセーフエリア（ホームバー）を避ける。高さは 64px + セーフエリア。
 */
export function BottomNav({
  current,
  hrefs,
  LinkComponent: Link = DefaultLink,
  onNavigate,
  className,
}: BottomNavProps) {
  return (
    <nav
      className={cn(
        'safe-bottom safe-x fixed inset-x-0 bottom-0 z-40 border-t border-sand bg-surface',
        className,
      )}
    >
      <ul className="layout-guest flex h-nav items-stretch">
        {items.map(({ key, label, Icon }) => {
          const active = current === key
          const isUpload = key === 'upload'
          return (
            <li key={key} className="flex flex-1">
              <Link
                href={hrefs[key]}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate?.(key)}
                className={cn(
                  'relative flex min-h-tap flex-1 flex-col items-center justify-center gap-0.5 text-caption focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-champagne',
                  active ? 'font-semibold text-charcoal' : 'text-warm-gray',
                )}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-4 top-0 h-0.5 bg-champagne"
                  />
                ) : null}
                {isUpload ? (
                  <span className="-mt-5 flex size-12 items-center justify-center rounded-full bg-charcoal text-white shadow-card">
                    <Icon aria-hidden="true" strokeWidth={ICON_STROKE_WIDTH} />
                  </span>
                ) : (
                  <Icon aria-hidden="true" strokeWidth={ICON_STROKE_WIDTH} />
                )}
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
