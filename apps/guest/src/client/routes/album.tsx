import type { GuestPhoto } from '@wym/shared'
import {
  EmptyState,
  ErrorState,
  ja,
  PageTransition,
  PhotoGrid,
  type PhotoGridItem,
  PhotoViewer,
  PullIndicator,
  RankingBoard,
  type RankingBoardItem,
  ScreenHeader,
  Skeleton,
  type TabItem,
  Tabs,
  usePhotoSave,
  useToast,
} from '@wym/ui'
import { type ReactNode, useCallback, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { deletePhoto, getMe, likePhoto, unlikePhoto } from '../lib/api'
import { type LikePatch, usePhotoRanking, usePhotoTimeline } from '../lib/photo-feeds'
import { paths, RouterLink } from '../lib/router-link'
import { useApiActionErrorHandler } from '../lib/use-action-error'
import { useApiResource } from '../lib/use-api-resource'
import { usePullToRefresh } from '../lib/use-pull-to-refresh'

type AlbumTab = 'timeline' | 'ranking'
type ViewerState = { source: AlbumTab; index: number }

const PANEL_ID = 'album-panel'
/** 続きを読み込み始める、末尾までの残り枚数（拡大表示で前後に移動しているとき） */
const PREFETCH_MARGIN = 3

function toGridItem(photo: GuestPhoto): PhotoGridItem {
  return {
    id: photo.id,
    src: photo.urls.thumb,
    nickname: photo.uploader.nickname,
    likeCount: photo.likeCount,
    liked: photo.likedByMe,
  }
}

function GridSkeleton() {
  return (
    <div data-testid="album-skeleton" className="album-skeleton-grid">
      {Array.from({ length: 12 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 固定の装飾
        <Skeleton key={i} className="aspect-[4/5] w-full rounded-none" />
      ))}
    </div>
  )
}

function RankingSkeleton() {
  return (
    <div data-testid="album-skeleton" className="flex flex-col items-center gap-6 px-3 pt-12">
      <Skeleton className="aspect-[4/5] w-[min(100%,22rem)] rounded-none" />
      <div className="grid w-full grid-cols-2 gap-5">
        <Skeleton className="aspect-[4/5] w-full rounded-none" />
        <Skeleton className="aspect-[4/5] w-full rounded-none" />
      </div>
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

function FilterChips({ mine, onChange }: { mine: boolean; onChange: (mine: boolean) => void }) {
  return (
    <div className="album-filters">
      <button
        type="button"
        aria-pressed={!mine}
        className="filter-chip"
        onClick={() => onChange(false)}
      >
        {ja.guest.album.filters.all}
      </button>
      <button
        type="button"
        aria-pressed={mine}
        className="filter-chip"
        onClick={() => onChange(true)}
      >
        {ja.guest.album.filters.mine}
      </button>
    </div>
  )
}

// SG-06 共有フォトアルバム
export function AlbumRoute() {
  const { tenantId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab: AlbumTab = params.get('tab') === 'ranking' ? 'ranking' : 'timeline'
  const mine = params.get('mine') === '1'

  const toast = useToast()
  const handleActionError = useApiActionErrorHandler()
  const savePhoto = usePhotoSave()

  const me = useApiResource(() => getMe(tenantId), [tenantId])
  const timeline = usePhotoTimeline(tenantId, mine)
  const ranking = usePhotoRanking(tenantId, tab === 'ranking')
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  // 自分の写真を削除した枚数（あと何枚投稿できるかを、取得し直さずに更新する）
  const [deletedCount, setDeletedCount] = useState(0)

  const { distance, refreshing } = usePullToRefresh(
    () => (tab === 'ranking' ? ranking.refresh() : timeline.refresh()),
    viewer === null,
  )

  function updateParams(change: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params)
    change(next)
    setParams(next, { replace: true })
  }

  const tabs: TabItem<AlbumTab>[] = [
    { id: 'timeline', label: ja.guest.album.tabs.timeline, panelId: PANEL_ID },
    { id: 'ranking', label: ja.guest.album.tabs.ranking, panelId: PANEL_ID },
  ]

  function changeTab(next: AlbumTab) {
    updateParams((search) => {
      if (next === 'ranking') search.set('tab', 'ranking')
      else search.delete('tab')
    })
  }

  function changeMine(next: boolean) {
    updateParams((search) => {
      if (next) search.set('mine', '1')
      else search.delete('mine')
    })
  }

  // --- いいね（楽観的に更新し、失敗したら戻す） ---
  const likeInFlight = useRef(new Set<string>())
  const patchLike = useCallback(
    (id: string, patch: LikePatch) => {
      timeline.patchLike(id, patch)
      ranking.patchLike(id, patch)
    },
    [timeline.patchLike, ranking.patchLike],
  )

  async function toggleLike(photo: GuestPhoto) {
    if (likeInFlight.current.has(photo.id)) return
    likeInFlight.current.add(photo.id)
    const previous: LikePatch = { likeCount: photo.likeCount, likedByMe: photo.likedByMe }
    patchLike(photo.id, {
      likedByMe: !photo.likedByMe,
      likeCount: Math.max(0, photo.likeCount + (photo.likedByMe ? -1 : 1)),
    })
    try {
      const result = await (photo.likedByMe ? unlikePhoto : likePhoto)(tenantId, photo.id)
      patchLike(photo.id, result)
    } catch (error) {
      patchLike(photo.id, previous)
      handleActionError(error)
    } finally {
      likeInFlight.current.delete(photo.id)
    }
  }

  // --- 自分の写真の削除 ---
  async function removePhoto(photo: GuestPhoto): Promise<boolean> {
    try {
      await deletePhoto(tenantId, photo.id)
    } catch (error) {
      handleActionError(error)
      return false
    }
    toast.show(ja.toasts.photoDeleted)
    timeline.remove(photo.id)
    ranking.remove(photo.id)
    if (photo.isMine) setDeletedCount((count) => count + 1)
    return true
  }

  // --- 拡大表示 ---
  const viewerPhotos: readonly GuestPhoto[] =
    viewer?.source === 'ranking' ? ranking.photos : timeline.photos

  function changeViewerIndex(index: number) {
    setViewer((current) => (current ? { ...current, index } : current))
    if (
      viewer?.source === 'timeline' &&
      timeline.nextCursor !== null &&
      !timeline.moreFailed &&
      index >= timeline.photos.length - PREFETCH_MARGIN
    ) {
      void timeline.loadMore()
    }
  }

  const remaining =
    me.state === 'ready'
      ? Math.max(0, me.data.me.photoLimit - me.data.me.photoCount + deletedCount)
      : null

  const postLink = (
    <RouterLink
      href={paths.upload(tenantId)}
      className="ui-button"
      data-variant="primary"
      data-tone="beni"
    >
      {ja.guest.home.cards.upload}
    </RouterLink>
  )

  let content: ReactNode
  if (tab === 'ranking') {
    if (ranking.status === 'loading') content = <RankingSkeleton />
    else if (ranking.status === 'error') content = <ErrorState onRetry={ranking.reload} />
    else if (ranking.photos.length === 0) {
      content = <EmptyState message={ja.guest.album.empty.ranking} />
    } else {
      const items: RankingBoardItem[] = ranking.photos.map((photo) => ({
        ...toGridItem(photo),
        rank: photo.rank,
      }))
      content = (
        <RankingBoard
          items={items}
          onSelect={(_item, index) => setViewer({ source: 'ranking', index })}
        />
      )
    }
  } else if (timeline.status === 'loading') {
    content = <GridSkeleton />
  } else if (timeline.status === 'error') {
    content = <ErrorState onRetry={timeline.reload} />
  } else if (timeline.photos.length === 0) {
    content = (
      <EmptyState
        message={mine ? ja.guest.album.empty.mine : ja.guest.album.empty.timeline}
        action={postLink}
      />
    )
  } else {
    content = (
      <>
        <PhotoGrid
          photos={timeline.photos.map(toGridItem)}
          onSelect={(_photo, index) => setViewer({ source: 'timeline', index })}
          {...(timeline.nextCursor !== null && !timeline.moreFailed
            ? { onReachEnd: () => void timeline.loadMore() }
            : {})}
        />
        {timeline.moreFailed ? <ErrorState onRetry={timeline.retryMore} /> : null}
      </>
    )
  }

  return (
    <div>
      <ScreenHeader
        title={ja.common.nav.album}
        backHref={paths.home(tenantId)}
        LinkComponent={RouterLink}
      />
      <PullIndicator distance={distance} refreshing={refreshing} />
      <div>
        <div className="album-tabs">
          <Tabs tabs={tabs} value={tab} onChange={changeTab} aria-label={ja.common.nav.album} />
        </div>
        <div id={PANEL_ID} role="tabpanel">
          {tab === 'timeline' ? (
            <div className="album-tools">
              <FilterChips mine={mine} onChange={changeMine} />
              {mine && remaining !== null ? (
                <p className="album-remaining">{ja.guest.album.remaining({ remaining })}</p>
              ) : null}
            </div>
          ) : null}
          <PageTransition key={`${tab}-${mine}`} className="album-content">
            {content}
          </PageTransition>
        </div>
      </div>

      {viewer ? (
        <PhotoViewer
          photos={viewerPhotos}
          index={viewer.index}
          onIndexChange={changeViewerIndex}
          onClose={() => setViewer(null)}
          onSave={savePhoto}
          onToggleLike={toggleLike}
          canDelete={(photo) => photo.isMine}
          onDelete={removePhoto}
        />
      ) : null}
    </div>
  )
}
