import type { StaffPhoto } from '@wym/shared'
import { EmptyState, ja, PhotoGrid, PhotoViewer, usePhotoSave, useToast } from '@wym/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { LoadError, LoadingBlocks, Screen } from '../components/shell'
import { ApiClientError, api } from '../lib/api'
import { messageOf } from '../lib/errors'

/** 1 回に読み込む枚数（仮置き） */
const PAGE_SIZE = 60

type State =
  | { status: 'loading' }
  | { status: 'error'; error: ApiClientError }
  | { status: 'ready'; photos: StaffPhoto[]; nextCursor: string | null }

/** SA-07 写真管理（FR-A-11） */
export function Photos() {
  const { tenantId = '' } = useParams()
  const toast = useToast()
  const save = usePhotoSave()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const loadingMore = useRef(false)
  const [attempt, setAttempt] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt で読み直す
  useEffect(() => {
    let cancelled = false
    loadingMore.current = false
    api.listPhotos(tenantId, { limit: PAGE_SIZE }).then(
      (res) => {
        if (!cancelled)
          setState({ status: 'ready', photos: res.photos, nextCursor: res.nextCursor })
      },
      (error: unknown) => {
        if (cancelled) return
        const e =
          error instanceof ApiClientError
            ? error
            : new ApiClientError(0, 'NETWORK', 'network error')
        setState({ status: 'error', error: e })
      },
    )
    return () => {
      cancelled = true
    }
  }, [tenantId, attempt])

  const retry = () => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  const cursor = state.status === 'ready' ? state.nextCursor : null
  const loadMore = useCallback(async () => {
    if (cursor === null || loadingMore.current) return
    loadingMore.current = true
    try {
      const res = await api.listPhotos(tenantId, { limit: PAGE_SIZE, cursor })
      setState((prev) => {
        if (prev.status !== 'ready') return prev
        const known = new Set(prev.photos.map((p) => p.id))
        return {
          status: 'ready',
          photos: [...prev.photos, ...res.photos.filter((p) => !known.has(p.id))],
          nextCursor: res.nextCursor,
        }
      })
    } catch (e) {
      toast.show(messageOf(e))
    } finally {
      loadingMore.current = false
    }
  }, [tenantId, cursor, toast])

  function removeFromList(photoId: string) {
    setState((prev) =>
      prev.status === 'ready'
        ? { ...prev, photos: prev.photos.filter((p) => p.id !== photoId) }
        : prev,
    )
  }

  async function remove(photo: StaffPhoto): Promise<boolean> {
    try {
      await api.deletePhoto(tenantId, photo.id)
    } catch (e) {
      toast.show(messageOf(e))
      // すでに削除されていた場合は、一覧からも除く
      if (e instanceof ApiClientError && e.code === 'NOT_FOUND') {
        removeFromList(photo.id)
        return true
      }
      return false
    }
    removeFromList(photo.id)
    toast.show(ja.toasts.photoDeleted)
    return true
  }

  const photos = state.status === 'ready' ? state.photos : []

  return (
    <Screen title={ja.admin.detail.photos} backHref={`/tenants/${tenantId}`}>
      <p className="text-sub text-muted">
        一枚ずつに残る、かけがえのない瞬間。写真を開くと保存・削除できます。
      </p>
      {state.status === 'loading' ? <LoadingBlocks /> : null}
      {state.status === 'error' ? <LoadError error={state.error} onRetry={retry} /> : null}
      {state.status === 'ready' && photos.length === 0 ? (
        <EmptyState message={ja.admin.photos.empty} />
      ) : null}
      {photos.length > 0 ? (
        <PhotoGrid
          photos={photos.map((p) => ({
            id: p.id,
            src: p.urls.thumb,
            nickname: p.uploader.nickname,
            likeCount: p.likeCount,
          }))}
          onSelect={(_, index) => setOpenIndex(index)}
          onReachEnd={cursor === null ? undefined : () => void loadMore()}
        />
      ) : null}
      {openIndex !== null ? (
        <PhotoViewer
          photos={photos}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          onSave={save}
          canDelete={() => true}
          onDelete={remove}
          deleteConfirm={ja.confirms.deletePhotoAdmin}
        />
      ) : null}
    </Screen>
  )
}
