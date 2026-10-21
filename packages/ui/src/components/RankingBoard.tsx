import { Heart } from 'lucide-react'
import { ja } from '../messages/ja'
import { RankingReveal, RankingRevealItem } from '../motion/RankingReveal'
import { cn } from './cn'
import { ICON_STROKE_WIDTH } from './constants'
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

function Likes({ item, className }: { item: RankingBoardItem; className?: string }) {
  return (
    <span className={cn('flex shrink-0 items-center gap-1 text-sub', className)}>
      <Heart
        aria-hidden="true"
        size={16}
        strokeWidth={ICON_STROKE_WIDTH}
        className={cn(item.liked && 'fill-rose text-rose')}
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
}: {
  item: RankingBoardItem
  onSelect: () => void
  className: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-photo-id={item.id}
      className={cn(
        'block overflow-hidden bg-rule/70 focus-visible:outline-2 focus-visible:outline-accent',
        className,
      )}
    >
      <img
        src={item.src}
        alt={ja.common.photoAlt({ nickname: item.nickname })}
        loading="lazy"
        decoding="async"
        className="size-full object-cover"
      />
    </button>
  )
}

/**
 * ランキング（SG-06・SC-02 で共通）。1 位は大きく、2 位・3 位は横に並べ、4 位以下は行で表示する。
 * 表示するたびに（マウントするたびに）3 位 → 2 位 → 1 位（王冠）の順に登場する。
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
      className={cn('flex flex-col gap-8', className)}
    >
      {first ? (
        <RankingRevealItem
          rank={1}
          className="pt-6 border-b border-rule pb-6"
          crownStyle={{ top: 0, left: 0 }}
        >
          <p className="mb-2 pl-10 font-accent text-heading-md text-accent">
            {ja.guest.album.rank({ rank: 1 })}
          </p>
          <Picture
            item={first.item}
            onSelect={select(first.item, first.index)}
            className="aspect-[4/5] w-full border-[6px] border-surface shadow-card"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-body">
              {ja.common.uploader({ nickname: first.item.nickname })}
            </p>
            <Likes item={first.item} />
          </div>
        </RankingRevealItem>
      ) : null}

      {podium.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {podium.map(({ item, index }) => (
            <RankingRevealItem key={item.id} rank={item.rank}>
              <p className="mb-1 font-accent text-heading-md text-accent">
                {ja.guest.album.rank({ rank: item.rank })}
              </p>
              <Picture
                item={item}
                onSelect={select(item, index)}
                className="aspect-[4/5] w-full border-[6px] border-surface shadow-card"
              />
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sub">
                  {ja.common.uploader({ nickname: item.nickname })}
                </p>
                <Likes item={item} />
              </div>
            </RankingRevealItem>
          ))}
        </div>
      ) : null}

      {rest.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {rest.map(({ item, index }) => (
            <RankingRevealItem key={item.id} rank={item.rank} as="li">
              <div className="flex items-center gap-3">
                <Picture
                  item={item}
                  onSelect={select(item, index)}
                  className="size-16 shrink-0 rounded-photo"
                />
                <p className="w-14 shrink-0 font-accent text-heading-md text-accent">
                  {ja.guest.album.rank({ rank: item.rank })}
                </p>
                <p className="min-w-0 flex-1 truncate text-body">
                  {ja.common.uploader({ nickname: item.nickname })}
                </p>
                <Likes item={item} />
              </div>
            </RankingRevealItem>
          ))}
        </ul>
      ) : null}
    </RankingReveal>
  )
}
