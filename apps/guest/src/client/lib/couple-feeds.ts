// 新郎新婦用の写真の一覧（すべての写真・ランキング）の取得。
// 参加者用（photo-feeds.ts）と同じ形だが、いいね・削除がなく、エラーは新郎新婦向けに扱う。

import type { RankedPhoto, StaffPhoto } from '@wym/shared'
import { ja, useToast } from '@wym/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getCouplePhotos, getCoupleRanking } from './api'
import { useApiErrorHandler } from './error-handling'
import type { FeedStatus } from './photo-feeds'

type TimelineState = {
  status: FeedStatus
  photos: StaffPhoto[]
  nextCursor: string | null
  /** 続きの読み込みに失敗した（もう一度試すまで続きは読み込まない） */
  moreFailed: boolean
}

const EMPTY_TIMELINE: TimelineState = {
  status: 'loading',
  photos: [],
  nextCursor: null,
  moreFailed: false,
}

/** 更新・続きの読み込みの失敗の扱い（遷移とトースト。通信エラーもトースト） */
function useCoupleActionErrorHandler(): (error: unknown) => void {
  const handleError = useApiErrorHandler({ audience: 'couple' })
  const toast = useToast()
  return useCallback(
    (error: unknown) => {
      if (handleError(error) === 'network') toast.show(ja.errors.network)
    },
    [handleError, toast],
  )
}

/**
 * 新しい順の写真。`uploaderId` で投稿者に絞り込む。切り替えると最初から読み込み直す。
 * `loadMore` は読み込み中・最後まで取得済み・失敗中は何もしない。
 */
export function useCoupleTimeline(tenantId: string, uploaderId: string | null) {
  const [state, setState] = useState<TimelineState>(EMPTY_TIMELINE)
  const handleError = useApiErrorHandler({ audience: 'couple' })
  const handleActionError = useCoupleActionErrorHandler()
  const handleErrorRef = useRef(handleError)
  handleErrorRef.current = handleError
  const handleActionErrorRef = useRef(handleActionError)
  handleActionErrorRef.current = handleActionError
  const generation = useRef(0)
  const loadingMore = useRef(false)
  const cursor = useRef<string | null>(null)
  const status = useRef<FeedStatus>('loading')
  status.current = state.status

  const query = useCallback(() => (uploaderId ? { uploaderId } : {}), [uploaderId])

  const loadFirst = useCallback(
    async (mode: 'initial' | 'refresh') => {
      generation.current += 1
      const gen = generation.current
      loadingMore.current = false
      if (mode === 'initial') setState(EMPTY_TIMELINE)
      try {
        const response = await getCouplePhotos(tenantId, query())
        if (gen !== generation.current) return
        cursor.current = response.nextCursor
        setState({
          status: 'ready',
          photos: response.photos,
          nextCursor: response.nextCursor,
          moreFailed: false,
        })
      } catch (error) {
        if (gen !== generation.current) return
        if (mode === 'refresh') {
          handleActionErrorRef.current(error)
          return
        }
        const type = handleErrorRef.current(error)
        if (type !== 'redirect') setState({ ...EMPTY_TIMELINE, status: 'error' })
      }
    },
    [tenantId, query],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: tenantId と uploaderId が変わったときだけ読み込み直す
  useEffect(() => {
    void loadFirst('initial')
    return () => {
      generation.current += 1
    }
  }, [tenantId, uploaderId])

  const loadMore = useCallback(async () => {
    if (loadingMore.current || status.current !== 'ready' || cursor.current === null) return
    loadingMore.current = true
    const gen = generation.current
    try {
      const response = await getCouplePhotos(tenantId, { ...query(), cursor: cursor.current })
      if (gen !== generation.current) return
      cursor.current = response.nextCursor
      setState((current) => {
        const known = new Set(current.photos.map((photo) => photo.id))
        return {
          ...current,
          photos: [...current.photos, ...response.photos.filter((photo) => !known.has(photo.id))],
          nextCursor: response.nextCursor,
          moreFailed: false,
        }
      })
    } catch (error) {
      if (gen !== generation.current) return
      handleActionErrorRef.current(error)
      setState((current) => ({ ...current, moreFailed: true }))
    } finally {
      if (gen === generation.current) loadingMore.current = false
    }
  }, [tenantId, query])

  const retryMore = useCallback(() => {
    setState((current) => ({ ...current, moreFailed: false }))
    void loadMore()
  }, [loadMore])

  return {
    ...state,
    reload: useCallback(() => loadFirst('initial'), [loadFirst]),
    refresh: useCallback(() => loadFirst('refresh'), [loadFirst]),
    loadMore,
    retryMore,
  }
}

type RankingState = { status: FeedStatus; photos: RankedPhoto<StaffPhoto>[] }

/** ランキング（上位 10 枚）。`active` になるたびに取得し直す（登場の演出を毎回再生するため） */
export function useCoupleRanking(tenantId: string, active: boolean) {
  const [state, setState] = useState<RankingState>({ status: 'loading', photos: [] })
  const handleError = useApiErrorHandler({ audience: 'couple' })
  const handleActionError = useCoupleActionErrorHandler()
  const handleErrorRef = useRef(handleError)
  handleErrorRef.current = handleError
  const handleActionErrorRef = useRef(handleActionError)
  handleActionErrorRef.current = handleActionError
  const generation = useRef(0)

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      generation.current += 1
      const gen = generation.current
      if (mode === 'initial') setState({ status: 'loading', photos: [] })
      try {
        const response = await getCoupleRanking(tenantId)
        if (gen !== generation.current) return
        setState({ status: 'ready', photos: response.photos })
      } catch (error) {
        if (gen !== generation.current) return
        if (mode === 'refresh') {
          handleActionErrorRef.current(error)
          return
        }
        const type = handleErrorRef.current(error)
        if (type !== 'redirect') setState({ status: 'error', photos: [] })
      }
    },
    [tenantId],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: 表示するたび（active が true になるたび）に取得し直す
  useEffect(() => {
    if (!active) return
    void load('initial')
    return () => {
      generation.current += 1
    }
  }, [tenantId, active])

  return {
    ...state,
    reload: useCallback(() => load('initial'), [load]),
    refresh: useCallback(() => load('refresh'), [load]),
  }
}
