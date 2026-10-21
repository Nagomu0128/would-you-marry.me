import { HOME_RECENT_PHOTO_COUNT } from '@wym/shared'
import { ErrorState, HomeScreen, ja, ScreenHeader, Skeleton, WelcomeAnimation } from '@wym/ui'
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { getMe, getPhotos } from '../lib/api'
import { paths, RouterLink } from '../lib/router-link'
import { useApiResource } from '../lib/use-api-resource'
import { hasPlayedWelcome, markWelcomePlayed } from '../lib/welcome-storage'

// SG-03 ホーム
export function HomeRoute() {
  const { tenantId = '' } = useParams()
  const resource = useApiResource(() => getMe(tenantId), [tenantId])
  const [photos, setPhotos] = useState<Awaited<ReturnType<typeof getPhotos>>['photos']>([])
  useEffect(() => {
    let active = true
    setPhotos([])
    getPhotos(tenantId, { limit: HOME_RECENT_PHOTO_COUNT }).then(
      (result) => {
        if (active) setPhotos(result.photos)
      },
      () => {
        /* Recent photos are optional; the invitation stays usable on a slow connection. */
      },
    )
    return () => {
      active = false
    }
  }, [tenantId])
  const [welcomeDone, setWelcomeDone] = useState(false)

  if (resource.state === 'loading') {
    return (
      <div>
        <ScreenHeader title="" />
        <div className="flex flex-col gap-4 px-screen">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    )
  }
  if (resource.state === 'error') return <ErrorState onRetry={resource.reload} />

  const me = resource.data
  if (me.me.nickname === null) return <Navigate to={paths.nickname(tenantId)} replace />

  const showWelcome = !welcomeDone && !hasPlayedWelcome(tenantId)

  return (
    <>
      <HomeScreen
        tenantName={me.tenant.name}
        eventDate={me.tenant.eventDate}
        nickname={me.me.nickname}
        recentPhotos={photos.map((photo) => ({
          id: photo.id,
          src: photo.urls.thumb,
          nickname: photo.uploader.nickname,
        }))}
        hrefs={{
          seating: paths.seating(tenantId),
          course: paths.menu(tenantId),
          album: paths.album(tenantId),
          upload: paths.upload(tenantId),
          nickname: paths.nickname(tenantId),
        }}
        LinkComponent={RouterLink}
      />
      {showWelcome ? (
        <WelcomeAnimation
          tenantName={me.tenant.name}
          skipLabel={ja.common.skipAnimation}
          onComplete={() => {
            markWelcomePlayed(tenantId)
            setWelcomeDone(true)
          }}
        />
      ) : null}
    </>
  )
}
