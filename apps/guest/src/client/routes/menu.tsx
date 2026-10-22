import { CourseMenuView, ErrorState, ja, ScreenHeader, Skeleton } from '@wym/ui'
import { useParams } from 'react-router'
import { getCourseMenu } from '../lib/api'
import { paths, RouterLink } from '../lib/router-link'
import { useApiResource } from '../lib/use-api-resource'

// SG-05 料理のコース表（額装した御品書きの見立て）
export function MenuRoute() {
  const { tenantId = '' } = useParams()
  const resource = useApiResource(() => getCourseMenu(tenantId), [tenantId])

  return (
    <div>
      <ScreenHeader
        title={ja.guest.course.heading}
        description={ja.guest.course.lead}
        backHref={paths.home(tenantId)}
        LinkComponent={RouterLink}
      />
      <div className="document-page">
        {resource.state === 'loading' ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="aspect-[3/4] w-full rounded-none" />
            <Skeleton className="aspect-[3/4] w-full rounded-none" />
          </div>
        ) : null}
        {resource.state === 'error' ? <ErrorState onRetry={resource.reload} /> : null}
        {resource.state === 'ready' ? <CourseMenuView images={resource.data.images} /> : null}
      </div>
    </div>
  )
}
