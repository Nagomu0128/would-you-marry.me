import type { StaffPhoto, Uploader } from '@wym/shared'
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  ja,
  MizuhikiKnot,
  PageTransition,
  PhotoGrid,
  type PhotoGridItem,
  PhotoViewer,
  PullIndicator,
  RankingBoard,
  type RankingBoardItem,
  Skeleton,
  type TabItem,
  Tabs,
  usePhotoSave,
} from '@wym/ui'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { getCoupleMe, getUploaders } from '../lib/api'
import { useCoupleRanking, useCoupleTimeline } from '../lib/couple-feeds'
import { useApiResource } from '../lib/use-api-resource'
import { usePullToRefresh } from '../lib/use-pull-to-refresh'

type CoupleTab = 'all' | 'ranking'
type ViewerState = { source: CoupleTab; index: number }

const PANEL_ID = 'couple-panel'
/** 続きを読み込み始める、末尾までの残り枚数（拡大表示で前後に移動しているとき） */
const PREFETCH_MARGIN = 3

function toGridItem(photo: StaffPhoto): PhotoGridItem {
  return {
    id: photo.id,
    src: photo.urls.thumb,
    nickname: photo.uploader.nickname,
    likeCount: photo.likeCount,
  }
}

function GridSkeleton() {
  return (
    <div data-testid="couple-skeleton" className="album-skeleton-grid">
      {Array.from({ length: 12 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 固定の装飾
        <Skeleton key={i} className="aspect-[4/5] w-full rounded-none" />
      ))}
    </div>
  )
}

function RankingSkeleton() {
  return (
    <div data-testid="couple-skeleton" className="flex flex-col items-center gap-6 px-3 pt-12">
      <Skeleton className="aspect-[4/5] w-[min(100%,22rem)] rounded-none" />
      <div className="grid w-full grid-cols-2 gap-5">
        <Skeleton className="aspect-[4/5] w-full rounded-none" />
        <Skeleton className="aspect-[4/5] w-full rounded-none" />
      </div>
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

/**
 * 写真一覧の上の帯。おふたりに宛てた祝いの包みの掛け紙の見立て（臙脂の青海波・水引・名前）。
 * 名前が見出し（h1）になる。
 */
function CoupleBand({ title }: { title: string }) {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
  return (
    <header className="couple-band wa-seigaiha">
      <div className="couple-band-inner">
        <MizuhikiKnot strands="three" tone="on-dark" />
        <h1 className="couple-title">{title}</h1>
        <p className="couple-lead">{ja.couple.photos.lead}</p>
      </div>
    </header>
  )
}

/** 投稿者の一覧（下から出るシート）。選ぶと閉じる。「すべて」で絞り込みを解除する */
function UploaderSheet({
  uploaders,
  selectedId,
  onSelect,
  onClose,
  onRetry,
}: {
  uploaders: { state: 'loading' } | { state: 'error' } | { state: 'ready'; list: Uploader[] }
  selectedId: string | null
  onSelect: (id: string | null) => void
  onClose: () => void
  onRetry: () => void
}) {
  let body: ReactNode
  if (uploaders.state === 'loading') {
    body = <Skeleton className="h-24 w-full" />
  } else if (uploaders.state === 'error') {
    body = <ErrorState onRetry={onRetry} />
  } else {
    body = (
      <ul className="uploader-list">
        <li>
          <button
            type="button"
            aria-pressed={selectedId === null}
            className="uploader-row"
            onClick={() => onSelect(null)}
          >
            <span className="uploader-name">{ja.couple.photos.uploaderAll}</span>
          </button>
        </li>
        {uploaders.list.map((uploader) => (
          <li key={uploader.id}>
            <button
              type="button"
              aria-pressed={selectedId === uploader.id}
              className="uploader-row"
              onClick={() => onSelect(uploader.id)}
            >
              <span className="uploader-name">{uploader.nickname}</span>
              <span className="uploader-count">
                {ja.couple.photos.uploaderPhotoCount({ count: uploader.photoCount })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Dialog
      onClose={onClose}
      label={ja.couple.photos.uploaderSheetTitle}
      initialFocus="[data-close]"
      testId="uploader-backdrop"
    >
      <h2 className="modal-title">{ja.couple.photos.uploaderSheetTitle}</h2>
      {body}
      <Button data-close variant="secondary" fullWidth className="mt-4" onClick={onClose}>
        {ja.common.viewer.close}
      </Button>
    </Dialog>
  )
}

// SC-02 写真一覧
export function CouplePhotosRoute() {
  const { tenantId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab: CoupleTab = params.get('tab') === 'ranking' ? 'ranking' : 'all'
  const uploaderId = params.get('uploader')

  const savePhoto = usePhotoSave()

  const me = useApiResource(() => getCoupleMe(tenantId), [tenantId], { audience: 'couple' })
  const uploaders = useApiResource(() => getUploaders(tenantId), [tenantId], {
    audience: 'couple',
  })
  // 取得し直している間も、選んだ投稿者の名前を出し続ける
  const knownUploaders = useRef<Uploader[]>([])
  if (uploaders.state === 'ready') knownUploaders.current = uploaders.data.uploaders
  const selected = uploaderId
    ? (knownUploaders.current.find((uploader) => uploader.id === uploaderId) ?? null)
    : null

  const timeline = useCoupleTimeline(tenantId, uploaderId)
  const ranking = useCoupleRanking(tenantId, tab === 'ranking')
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const { distance, refreshing } = usePullToRefresh(
    () => (tab === 'ranking' ? ranking.refresh() : timeline.refresh()),
    viewer === null && !sheetOpen,
  )

  function updateParams(change: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params)
    change(next)
    setParams(next, { replace: true })
  }

  const tabs: TabItem<CoupleTab>[] = [
    { id: 'all', label: ja.couple.photos.tabs.all, panelId: PANEL_ID },
    { id: 'ranking', label: ja.couple.photos.tabs.ranking, panelId: PANEL_ID },
  ]

  function changeTab(next: CoupleTab) {
    updateParams((search) => {
      if (next === 'ranking') search.set('tab', 'ranking')
      else search.delete('tab')
    })
  }

  function changeUploader(id: string | null) {
    setSheetOpen(false)
    updateParams((search) => {
      if (id) search.set('uploader', id)
      else search.delete('uploader')
    })
  }

  function changeViewerIndex(index: number) {
    setViewer((current) => (current ? { ...current, index } : current))
    if (
      viewer?.source === 'all' &&
      timeline.nextCursor !== null &&
      !timeline.moreFailed &&
      index >= timeline.photos.length - PREFETCH_MARGIN
    ) {
      void timeline.loadMore()
    }
  }

  const viewerPhotos: readonly StaffPhoto[] =
    viewer?.source === 'ranking' ? ranking.photos : timeline.photos

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
    content = <EmptyState message={ja.couple.photos.empty} />
  } else {
    content = (
      <>
        <PhotoGrid
          photos={timeline.photos.map(toGridItem)}
          onSelect={(_photo, index) => setViewer({ source: 'all', index })}
          {...(timeline.nextCursor !== null && !timeline.moreFailed
            ? { onReachEnd: () => void timeline.loadMore() }
            : {})}
        />
        {timeline.moreFailed ? <ErrorState onRetry={timeline.retryMore} /> : null}
      </>
    )
  }

  const uploaderLabel = ja.couple.photos.uploaderSelected({
    nickname: selected?.nickname ?? ja.couple.photos.uploaderAll,
  })

  return (
    <div>
      <CoupleBand title={me.state === 'ready' ? me.data.tenant.name : ''} />
      <PullIndicator distance={distance} refreshing={refreshing} />
      <div>
        <div className="couple-tabs">
          <Tabs
            tabs={tabs}
            value={tab}
            onChange={changeTab}
            aria-label={ja.couple.photos.tabs.all}
          />
        </div>
        <div id={PANEL_ID} role="tabpanel">
          {tab === 'all' ? (
            <div className="album-tools">
              <button
                type="button"
                aria-haspopup="dialog"
                className="filter-chip"
                onClick={() => setSheetOpen(true)}
              >
                {uploaderLabel}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
          ) : null}
          <PageTransition key={`${tab}-${uploaderId ?? ''}`} className="album-content">
            {content}
          </PageTransition>
        </div>
      </div>

      {sheetOpen ? (
        <UploaderSheet
          uploaders={
            uploaders.state === 'ready'
              ? { state: 'ready', list: uploaders.data.uploaders }
              : { state: uploaders.state }
          }
          selectedId={uploaderId}
          onSelect={changeUploader}
          onClose={() => setSheetOpen(false)}
          onRetry={uploaders.reload}
        />
      ) : null}

      {viewer ? (
        <PhotoViewer
          photos={viewerPhotos}
          index={viewer.index}
          onIndexChange={changeViewerIndex}
          onClose={() => setViewer(null)}
          onSave={savePhoto}
        />
      ) : null}
    </div>
  )
}
