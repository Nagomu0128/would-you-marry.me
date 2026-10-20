import { ListCard } from '../components/ListCard'
import { DefaultLink, type LinkComponent } from '../components/link'
import { ScreenHeader } from '../components/ScreenHeader'
import { ja } from '../messages/ja'

export type HomeScreenPhoto = {
  id: string
  /** 一覧用画像の URL */
  src: string
  nickname: string
}

export type HomeScreenProps = {
  tenantName: string
  /** 開催日（`YYYY-MM-DD`） */
  eventDate: string
  nickname: string
  /** アルバムのカードに出す新着の写真（先頭から最大 3 枚） */
  recentPhotos?: readonly HomeScreenPhoto[]
  hrefs: {
    seating: string
    course: string
    album: string
    upload: string
    /** ニックネームの変更 */
    nickname: string
  }
  LinkComponent?: LinkComponent
}

/** `2026-10-31` を `2026.10.31` にする */
export function formatEventDate(eventDate: string): string {
  return eventDate.replaceAll('-', '.')
}

const RECENT_COUNT = 3

/** ホーム（SG-03）の表示。データの取得はしない。管理面のプレビューでも使う。 */
export function HomeScreen({
  tenantName,
  eventDate,
  nickname,
  recentPhotos = [],
  hrefs,
  LinkComponent: Link = DefaultLink,
}: HomeScreenProps) {
  const recent = recentPhotos.slice(0, RECENT_COUNT)
  return (
    <div>
      <ScreenHeader title={tenantName} />
      <div className="flex flex-col gap-4 px-screen pb-6">
        <p className="font-accent text-heading-md text-deep-gold">{formatEventDate(eventDate)}</p>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 break-words text-body">
            {ja.guest.home.greeting({ nickname })}
          </p>
          <Link
            href={hrefs.nickname}
            className="inline-flex min-h-tap min-w-tap shrink-0 items-center justify-center px-2 text-body text-deep-gold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-champagne"
          >
            {ja.guest.home.change}
          </Link>
        </div>
        <ListCard title={ja.guest.home.cards.seating} href={hrefs.seating} LinkComponent={Link} />
        <ListCard title={ja.guest.home.cards.course} href={hrefs.course} LinkComponent={Link} />
        <ListCard title={ja.guest.home.cards.album} href={hrefs.album} LinkComponent={Link}>
          {recent.length > 0 ? (
            <span className="flex items-center gap-2">
              <span className="text-caption">{ja.guest.home.recent}</span>
              {recent.map((photo) => (
                <img
                  key={photo.id}
                  src={photo.src}
                  alt={ja.common.photoAlt({ nickname: photo.nickname })}
                  className="size-14 rounded-photo bg-sand/70 object-cover"
                />
              ))}
            </span>
          ) : null}
        </ListCard>
        <ListCard title={ja.guest.home.cards.upload} href={hrefs.upload} LinkComponent={Link} />
      </div>
    </div>
  )
}
