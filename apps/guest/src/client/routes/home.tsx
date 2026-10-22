import { HOME_RECENT_PHOTO_COUNT } from '@wym/shared'
import { ErrorState, HomeScreen, ja, Skeleton, WelcomeAnimation } from '@wym/ui'
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { getMe, getPhotos } from '../lib/api'
import { paths, RouterLink } from '../lib/router-link'
import { useApiResource } from '../lib/use-api-resource'
import { hasPlayedWelcome, markWelcomePlayed } from '../lib/welcome-storage'

/** 読み込み中: 表紙・宛名の札・祝儀袋の形 */
function HomeSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col items-center gap-4 pb-6">
      <Skeleton className="h-[26rem] w-full rounded-none" />
      <Skeleton className="-mt-12 h-14 w-[min(22rem,80%)]" />
      <Skeleton className="mt-10 h-64 w-[min(11rem,70%)]" />
      <Skeleton className="h-12 w-[min(12rem,80%)]" />
    </div>
  )
}

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

  if (resource.state === 'loading') return <HomeSkeleton />
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
          eventDate={me.tenant.eventDate}
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
