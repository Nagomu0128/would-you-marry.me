import { ChevronRight } from 'lucide-react'
import { Fragment, useEffect, useId } from 'react'
import { SectionHeading } from '../components/Editorial'
import { DefaultLink, type LinkComponent } from '../components/link'
import { ja } from '../messages/ja'
import { Reveal } from '../motion/Reveal'
import { MizuhikiKnot } from '../ornaments/MizuhikiKnot'
import { Orizuru } from '../ornaments/Orizuru'

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

/** おふたりの名前の区切り（「A & B」「A家・B家」「A と B」）。前から順に試す */
const NAME_SEPARATORS = [/\s*[&＆]\s*/, /\s*・\s*/, /\s*×\s*/, /\s+と\s+/]

/**
 * 表紙に縦書きで並べるため、テナント名をおふたりの名前に分ける。
 * 区切りが見つからないときは 1 つのまま返す（区切りは表示の飾りにだけ使う）。
 */
export function splitCoupleName(name: string): { names: string[]; separator: string | null } {
  const trimmed = name.trim()
  for (const pattern of NAME_SEPARATORS) {
    const match = trimmed.match(pattern)
    if (!match || match.index === undefined) continue
    const before = trimmed.slice(0, match.index).trim()
    const after = trimmed.slice(match.index + match[0].length).trim()
    if (before && after) return { names: [before, after], separator: match[0].trim() }
  }
  return { names: [trimmed], separator: null }
}

/** 祝儀袋の右上の熨斗（のし）。装飾 */
function Noshi() {
  return (
    <svg viewBox="0 0 24 44" width={24} height={44} className="shugi-noshi" aria-hidden="true">
      <path
        d="M12 1.5 21.5 10 19 42.5H5L2.5 10Z"
        fill="var(--color-surface)"
        stroke="var(--color-gold)"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <path d="M12 6.5 17.6 12 15.8 38.5H8.2L6.4 12Z" fill="var(--color-accent)" />
      <path d="M10.8 12h2.4v22.5h-2.4Z" fill="var(--color-gold-light)" />
    </svg>
  )
}

/** 写真の四隅を留める金の写真コーナー。装飾 */
function PhotoCorners() {
  return (
    <span className="photo-corners" aria-hidden="true">
      <span data-corner="tl" />
      <span data-corner="tr" />
      <span data-corner="bl" />
      <span data-corner="br" />
    </span>
  )
}

/**
 * ホーム（SG-03）。式の表紙と、紙ものの入口。
 * - 表紙: 臙脂の青海波に、縦書きのおふたりの名前・金の日付・水引
 * - 宛名の札: あいさつと、ニックネームの変更
 * - 祝儀袋: 写真を贈る（投稿）入口。表書きと水引、名入れはニックネーム
 * - 席札・御品書き: 席次表と料理のコース
 * - 紙焼き写真: みんなのアルバムの新着（なければ折り鶴が最初の一枚を待つ）
 * データの取得はしない（管理面のプレビューでも使う）。
 */
export function HomeScreen({
  tenantName,
  eventDate,
  nickname,
  recentPhotos = [],
  hrefs,
  LinkComponent: Link = DefaultLink,
}: HomeScreenProps) {
  const recent = recentPhotos.slice(0, 3)
  const { names, separator } = splitCoupleName(tenantName)
  const guideId = useId()
  const albumId = useId()

  useEffect(() => {
    document.title = tenantName
  }, [tenantName])

  return (
    <div className="home">
      <section className="cover wa-seigaiha">
        <div className="cover-frame">
          <span className="cover-corners" aria-hidden="true" />
          <span className="cover-knot">
            <MizuhikiKnot strands="five" tone="on-dark" />
          </span>
          <h1 className="cover-names" aria-label={tenantName}>
            {names.map((name, index) => (
              <Fragment key={name}>
                {index > 0 && separator ? (
                  <span className="cover-sep" aria-hidden="true">
                    {separator}
                  </span>
                ) : null}
                <span className="cover-name">{name}</span>
              </Fragment>
            ))}
          </h1>
          <p className="cover-date font-numeral wa-kin-text wa-kin-sheen">
            <time dateTime={eventDate}>{formatEventDate(eventDate)}</time>
          </p>
          <p className="cover-line">{ja.guest.home.welcomeLine}</p>
        </div>
      </section>

      <Reveal className="home-greeting">
        <p className="home-greeting-text">{ja.guest.home.greeting({ nickname })}</p>
        <Link href={hrefs.nickname} className="home-greeting-change">
          {ja.guest.home.change}
        </Link>
      </Reveal>

      <Reveal className="home-gift">
        <Link href={hrefs.upload} className="shugi-link">
          <span className="shugi" aria-hidden="true">
            <Noshi />
            <span className="shugi-omote">{ja.guest.home.giftOmote}</span>
            <span className="shugi-band">
              <MizuhikiKnot strands="five" className="shugi-knot" />
            </span>
            <span className="shugi-name">{nickname}</span>
          </span>
          <span className="shugi-cta">
            {ja.guest.home.cards.upload}
            <ChevronRight aria-hidden="true" strokeWidth={1.6} />
          </span>
        </Link>
        <p className="shugi-note">{ja.guest.home.giftNote}</p>
      </Reveal>

      <Reveal className="home-section">
        <section aria-labelledby={guideId}>
          <SectionHeading id={guideId} title={ja.guest.home.guideHeading} />
          <div className="fuda-pair">
            <Link href={hrefs.seating} className="fuda" data-kind="seat">
              <span className="fuda-fold" aria-hidden="true" />
              <span className="fuda-title">{ja.guest.home.cards.seating}</span>
              <span className="fuda-note">{ja.guest.home.seatingNote}</span>
            </Link>
            <Link href={hrefs.course} className="fuda" data-kind="menu">
              <span className="fuda-mark" aria-hidden="true">
                {ja.guest.home.courseMark}
              </span>
              <span className="fuda-title">{ja.guest.home.cards.course}</span>
              <span className="fuda-note">{ja.guest.home.courseNote}</span>
            </Link>
          </div>
        </section>
      </Reveal>

      <Reveal className="home-section home-album">
        <section aria-labelledby={albumId}>
          <SectionHeading id={albumId} title={ja.guest.home.albumHeading} />
          {recent.length ? (
            <Link href={hrefs.album} className="prints" aria-label={ja.guest.home.openAlbum}>
              <span className="prints-tag">{ja.guest.home.recent}</span>
              <span className="prints-stack">
                {recent.map((photo) => (
                  <span className="print" key={photo.id}>
                    <img
                      src={photo.src}
                      alt={ja.common.photoAlt({ nickname: photo.nickname })}
                      width={240}
                      height={300}
                      loading="lazy"
                      decoding="async"
                    />
                    <PhotoCorners />
                  </span>
                ))}
              </span>
              <span className="prints-cta">
                {ja.guest.home.openAlbum}
                <ChevronRight aria-hidden="true" strokeWidth={1.6} />
              </span>
            </Link>
          ) : (
            <Link href={hrefs.album} className="prints prints-waiting">
              <span className="waiting-mount" aria-hidden="true">
                <PhotoCorners />
                <Orizuru tone="beni" className="waiting-orizuru" />
              </span>
              <span className="waiting-text">{ja.guest.home.albumEmpty}</span>
              <span className="prints-cta">
                {ja.guest.home.openAlbum}
                <ChevronRight aria-hidden="true" strokeWidth={1.6} />
              </span>
            </Link>
          )}
        </section>
      </Reveal>
    </div>
  )
}
