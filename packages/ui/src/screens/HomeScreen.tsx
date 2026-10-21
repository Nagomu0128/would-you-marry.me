import { ArrowUpRight, Camera, Users, Utensils } from 'lucide-react'
import { useEffect } from 'react'
import { SectionHeading } from '../components/Editorial'
import { DefaultLink, type LinkComponent } from '../components/link'
import { ja } from '../messages/ja'
import { WeddingMark } from '../motion/WeddingMark'

export type HomeScreenPhoto = { id: string; src: string; nickname: string }
export type HomeScreenProps = {
  tenantName: string
  eventDate: string
  nickname: string
  recentPhotos?: readonly HomeScreenPhoto[]
  hrefs: { seating: string; course: string; album: string; upload: string; nickname: string }
  LinkComponent?: LinkComponent
}
export function formatEventDate(eventDate: string): string {
  return eventDate.replaceAll('-', '.')
}

export function HomeScreen({
  tenantName,
  eventDate,
  nickname,
  recentPhotos = [],
  hrefs,
  LinkComponent: Link = DefaultLink,
}: HomeScreenProps) {
  const recent = recentPhotos.slice(0, 3)
  useEffect(() => {
    document.title = `${tenantName} | The Wedding Journal`
  }, [tenantName])
  return (
    <div>
      <section className="invitation">
        <WeddingMark className="wedding-mark" />
        <p className="eyebrow text-muted" lang="en">
          Together, on this day
        </p>
        <p className="invitation-title" lang="en" aria-hidden="true">
          Our wedding<em>journal.</em>
        </p>
        <h1 className="invitation-name">{tenantName}</h1>
        <p className="invitation-date">
          <time dateTime={eventDate}>{formatEventDate(eventDate)}</time>
        </p>
        <p className="invitation-note">
          今日という日を、みなさまと。
          <br />
          かけがえのない一日をお楽しみください。
        </p>
      </section>
      <div className="px-screen">
        <div className="home-greeting">
          <p>{ja.guest.home.greeting({ nickname })}</p>
          <Link href={hrefs.nickname} className="text-link">
            {ja.guest.home.change}
          </Link>
        </div>
        <section className="home-section">
          <Link
            href={hrefs.upload}
            className="share-invitation"
            aria-label={ja.guest.home.cards.upload}
          >
            <span>
              <span className="eyebrow" lang="en">
                A moment to keep
              </span>
              <strong>{ja.guest.home.cards.upload}</strong>
              <small>あなたが見つけた、幸せの一瞬を。</small>
            </span>
            <Camera aria-hidden="true" strokeWidth={1.25} />
          </Link>
        </section>
        <section className="home-section">
          <SectionHeading title="本日のご案内" caption="For our guests" />
          <div className="guide-links">
            <Link
              href={hrefs.seating}
              className="guide-link"
              aria-label={ja.guest.home.cards.seating}
            >
              <Users aria-hidden="true" strokeWidth={1.25} />
              <span>
                <strong>{ja.guest.home.cards.seating}</strong>
                <small lang="en">Find your seat</small>
              </span>
            </Link>
            <Link
              href={hrefs.course}
              className="guide-link"
              aria-label={ja.guest.home.cards.course}
            >
              <Utensils aria-hidden="true" strokeWidth={1.25} />
              <span>
                <strong>{ja.guest.home.cards.course}</strong>
                <small lang="en">At the table</small>
              </span>
            </Link>
          </div>
        </section>
        <section className="home-section pb-4">
          <SectionHeading
            title="みんなのアルバム"
            caption="Collected memories"
            action={
              <Link href={hrefs.album} className="text-link" aria-label={ja.guest.home.cards.album}>
                すべて見る
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            }
          />
          {recent.length ? (
            <>
              <p className="mb-3 text-caption text-muted">{ja.guest.home.recent}</p>
              <Link href={hrefs.album} className="recent-photos" aria-label="新着の写真を見る">
                {recent.map((photo) => (
                  <div className="recent-photo" key={photo.id}>
                    <img
                      src={photo.src}
                      alt={ja.common.photoAlt({ nickname: photo.nickname })}
                      width={240}
                      height={300}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                ))}
              </Link>
            </>
          ) : (
            <Link href={hrefs.album} className="album-invitation">
              <span lang="en">The first page.</span>
              <p>
                これから集まる、今日の思い出。
                <br />
                みなさまの写真で、一冊のアルバムに。
              </p>
            </Link>
          )}
        </section>
      </div>
    </div>
  )
}
