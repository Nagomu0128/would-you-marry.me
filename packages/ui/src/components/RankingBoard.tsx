import { Heart } from 'lucide-react'
import { ja } from '../messages/ja'
import { RankingReveal, RankingRevealItem } from '../motion/RankingReveal'
import { cn } from './cn'
import type { PhotoGridItem } from './PhotoGrid'

export type RankingBoardItem = PhotoGridItem & {
  /** 順位（1 始まり） */
  rank: number
}

export type RankingBoardProps = {
  /** 順位の順に並べた写真（最大 10 件） */
  items: readonly RankingBoardItem[]
  /** 写真をタップしたとき（`index` は `items` の位置） */
  onSelect?: (item: RankingBoardItem, index: number) => void
  /** 演出が終わったとき */
  onComplete?: () => void
  className?: string
}

function Likes({ item }: { item: RankingBoardItem }) {
  return (
    <span className="rank-likes">
      <Heart
        aria-hidden="true"
        size={14}
        strokeWidth={1.4}
        className={cn('heart', item.liked && 'is-filled')}
      />
      <span aria-hidden="true">{item.likeCount}</span>
      <span className="sr-only-text">{ja.common.likeCount({ count: item.likeCount })}</span>
    </span>
  )
}

function Picture({
  item,
  onSelect,
  className,
  eager = false,
}: {
  item: RankingBoardItem
  onSelect: () => void
  className: string
  eager?: boolean
}) {
  return (
    <button type="button" onClick={onSelect} data-photo-id={item.id} className={className}>
      <img
        src={item.src}
        alt={ja.common.photoAlt({ nickname: item.nickname })}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
      />
    </button>
  )
}

/**
 * ランキング（SG-06・SC-02 で共通）。紙焼き写真の写真帖の見立て。
 * 1 位は金の額縁に収め、2 位・3 位は細い金の縁で横に並べ、4 位以下は帳面の行で表示する。
 * 表示するたびに（マウントするたびに）3 位 → 2 位 → 1 位（飾り）の順に登場する。
 */
export function RankingBoard({ items, onSelect, onComplete, className }: RankingBoardProps) {
  const indexed = items.map((item, index) => ({ item, index }))
  const first = indexed.find(({ item }) => item.rank === 1)
  const podium = indexed.filter(({ item }) => item.rank === 2 || item.rank === 3)
  const rest = indexed.filter(({ item }) => item.rank >= 4)
  const select = (item: RankingBoardItem, index: number) => () => onSelect?.(item, index)

  return (
    <RankingReveal
      count={items.length}
      {...(onComplete ? { onComplete } : {})}
      className={cn('ranking', className)}
    >
      {first ? (
        <RankingRevealItem rank={1} className="rank-first" crownClassName="rank-first-crown">
          <p className="rank-label" data-rank="1">
            {ja.guest.album.rank({ rank: 1 })}
          </p>
          <div className="rank-gold-frame">
            <Picture
              item={first.item}
              eager
              onSelect={select(first.item, first.index)}
              className="rank-picture"
            />
          </div>
          <div className="rank-meta">
            <p className="rank-name">{ja.common.uploader({ nickname: first.item.nickname })}</p>
            <Likes item={first.item} />
          </div>
        </RankingRevealItem>
      ) : null}

      {podium.length > 0 ? (
        <div className="rank-podium">
          {podium.map(({ item, index }) => (
            <RankingRevealItem key={item.id} rank={item.rank} className="rank-second">
              <p className="rank-label" data-rank={item.rank}>
                {ja.guest.album.rank({ rank: item.rank })}
              </p>
              <Picture
                item={item}
                eager
                onSelect={select(item, index)}
                className="rank-picture rank-print"
              />
              <div className="rank-meta">
                <p className="rank-name">{ja.common.uploader({ nickname: item.nickname })}</p>
                <Likes item={item} />
              </div>
            </RankingRevealItem>
          ))}
        </div>
      ) : null}

      {rest.length > 0 ? (
        <ul className="rank-rows">
          {rest.map(({ item, index }) => (
            <RankingRevealItem key={item.id} rank={item.rank} as="li" className="rank-row">
              <p className="rank-label" data-rank={item.rank}>
                {ja.guest.album.rank({ rank: item.rank })}
              </p>
              <Picture
                item={item}
                onSelect={select(item, index)}
                className="rank-picture rank-thumb"
              />
              <p className="rank-name">{ja.common.uploader({ nickname: item.nickname })}</p>
              <Likes item={item} />
            </RankingRevealItem>
          ))}
        </ul>
      ) : null}
    </RankingReveal>
  )
}
