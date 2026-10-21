import { ErrorState, ja, ScreenHeader, SeatingChartView, Skeleton } from '@wym/ui'
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { useEffect } from 'react'
import { useParams } from 'react-router'
import { fetchSeatingChartUrl } from '../lib/api'
import { paths, RouterLink } from '../lib/router-link'
import { useApiResource } from '../lib/use-api-resource'

// SG-04 席次表
export function SeatingRoute() {
  const { tenantId = '' } = useParams()
  const resource = useApiResource(() => fetchSeatingChartUrl(tenantId), [tenantId])
  const url = resource.state === 'ready' ? resource.data : null

  // Blob URL は画面を離れるときに解放する
  useEffect(() => {
    if (!url) return
    return () => URL.revokeObjectURL(url)
  }, [url])

  return (
    <div>
      <ScreenHeader
        title={ja.guest.home.cards.seating}
        eyebrow="At the reception"
        description="お席を見つけて、ゆっくりお過ごしください。"
        backHref={paths.home(tenantId)}
        LinkComponent={RouterLink}
      />
      <div className="px-screen pb-6">
        <p className="content-note mb-5">2本の指、またはダブルタップで拡大できます。</p>
        {resource.state === 'loading' ? <Skeleton className="aspect-[1/1.414] w-full" /> : null}
        {resource.state === 'error' ? <ErrorState onRetry={resource.reload} /> : null}
        {resource.state === 'ready' ? (
          <SeatingChartView pdfUrl={url} workerSrc={workerSrc} />
        ) : null}
      </div>
    </div>
  )
}
