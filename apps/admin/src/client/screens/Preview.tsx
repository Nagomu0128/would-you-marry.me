import { HOME_RECENT_PHOTO_COUNT } from '@wym/shared'
import {
  CourseMenuView,
  ErrorState,
  HomeScreen,
  ja,
  type LinkComponent,
  ScreenHeader,
  SeatingChartView,
  Skeleton,
  Tabs,
} from '@wym/ui'
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { useState } from 'react'
import { useParams } from 'react-router'
import { LoadError, LoadingBlocks, Screen } from '../components/shell'
import { api, seatingChartUrl } from '../lib/api'
import { useAsync } from '../lib/use-async'

type PreviewTab = 'home' | 'seating' | 'course'

/** プレビューでは押せないリンク。見た目はそのままに、移動しない `<span>` にする */
const InertLink: LinkComponent = ({ children, className }) => (
  <span className={className} aria-disabled="true">
    {children}
  </span>
)

const NO_HREF = '#'

/** SA-08 参加者画面のプレビュー。GET だけを使い、参加者として登録しない */
export function Preview() {
  const { tenantId = '' } = useParams()
  const [tab, setTab] = useState<PreviewTab>('home')
  const nav = ja.common.nav
  const tabs = [
    { id: 'home', label: nav.home, panelId: 'preview-panel' },
    { id: 'seating', label: nav.seating, panelId: 'preview-panel' },
    { id: 'course', label: nav.course, panelId: 'preview-panel' },
  ] as const

  return (
    <Screen title={ja.admin.previewHeading} backHref={`/tenants/${tenantId}`}>
      <p className="text-sub text-muted">ゲストの目線で、当日のご案内を確認できます。</p>
      <Tabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        aria-label={ja.admin.detail.preview}
        className="mx-auto w-full max-w-[375px]"
      />
      <div
        id="preview-panel"
        role="tabpanel"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users must be able to scroll the preview without focusable content
        tabIndex={0}
        aria-label="参加者画面のプレビュー"
        data-testid="preview-frame"
        className="preview-frame"
      >
        {tab === 'home' ? <PreviewHome tenantId={tenantId} /> : null}
        {tab === 'seating' ? <PreviewSeating tenantId={tenantId} /> : null}
        {tab === 'course' ? <PreviewCourse tenantId={tenantId} /> : null}
      </div>
    </Screen>
  )
}

function PreviewHome({ tenantId }: { tenantId: string }) {
  const { state, retry } = useAsync(async () => {
    const [detail, photos] = await Promise.all([
      api.getTenant(tenantId),
      api.listPhotos(tenantId, { limit: HOME_RECENT_PHOTO_COUNT }),
    ])
    return { tenant: detail.tenant, photos: photos.photos }
  }, `preview-home:${tenantId}`)
  if (state.status === 'loading') return <FrameSkeleton />
  if (state.status === 'error') return <LoadError error={state.error} onRetry={retry} />
  const { tenant, photos } = state.data
  return (
    <HomeScreen
      tenantName={tenant.name}
      eventDate={tenant.eventDate}
      nickname={ja.admin.previewNickname}
      recentPhotos={photos.map((photo) => ({
        id: photo.id,
        src: photo.urls.thumb,
        nickname: photo.uploader.nickname,
      }))}
      hrefs={{
        seating: NO_HREF,
        course: NO_HREF,
        album: NO_HREF,
        upload: NO_HREF,
        nickname: NO_HREF,
      }}
      LinkComponent={InertLink}
    />
  )
}

function PreviewSeating({ tenantId }: { tenantId: string }) {
  const { state, retry } = useAsync(
    () => api.hasSeatingChart(tenantId),
    `preview-seating:${tenantId}`,
  )
  return (
    <div>
      <ScreenHeader title={ja.guest.home.cards.seating} />
      <div className="px-screen pb-6">
        {state.status === 'loading' ? <Skeleton className="aspect-[1/1.414] w-full" /> : null}
        {state.status === 'error' ? <ErrorState onRetry={retry} /> : null}
        {state.status === 'ready' ? (
          <SeatingChartView
            pdfUrl={state.data ? seatingChartUrl(tenantId) : null}
            workerSrc={workerSrc}
          />
        ) : null}
      </div>
    </div>
  )
}

function PreviewCourse({ tenantId }: { tenantId: string }) {
  const { state, retry } = useAsync(() => api.getCourseMenu(tenantId), `preview-course:${tenantId}`)
  return (
    <div>
      <ScreenHeader title={ja.guest.course.heading} />
      <div className="px-screen pb-6">
        {state.status === 'loading' ? <LoadingBlocks /> : null}
        {state.status === 'error' ? <LoadError error={state.error} onRetry={retry} /> : null}
        {state.status === 'ready' ? <CourseMenuView images={state.data.images} /> : null}
      </div>
    </div>
  )
}

function FrameSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-screen pt-4" aria-busy="true">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  )
}
