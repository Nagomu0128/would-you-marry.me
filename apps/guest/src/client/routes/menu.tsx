import { CourseMenuView, ErrorState, ja, ScreenHeader, Skeleton } from '@wym/ui'
import { useParams } from 'react-router'
import { getCourseMenu } from '../lib/api'
import { paths, RouterLink } from '../lib/router-link'
import { useApiResource } from '../lib/use-api-resource'

// SG-05 料理のコース表
export function MenuRoute() {
  const { tenantId = '' } = useParams()
  const resource = useApiResource(() => getCourseMenu(tenantId), [tenantId])

  return (
    <div>
      <ScreenHeader
        title={ja.guest.course.heading}
        eyebrow="At the table"
        description="おふたりから、感謝を込めたおもてなし。どうぞごゆっくりお楽しみください。"
        backHref={paths.home(tenantId)}
        LinkComponent={RouterLink}
      />
      <div className="px-screen pb-6">
        {resource.state === 'loading' ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="aspect-[3/4] w-full" />
            <Skeleton className="aspect-[3/4] w-full" />
          </div>
        ) : null}
        {resource.state === 'error' ? <ErrorState onRetry={resource.reload} /> : null}
        {resource.state === 'ready' ? <CourseMenuView images={resource.data.images} /> : null}
      </div>
    </div>
  )
}
