// アルバムの写真の一覧（タイムライン・ランキング）の取得と更新。
// 取得した一覧を持ち、いいね・削除は一覧の中の写真を直接書き換える（再取得しない）。

import type { GuestPhoto, RankedPhoto } from '@wym/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getPhotos, getRanking } from './api'
import { useApiErrorHandler } from './error-handling'
import { useApiActionErrorHandler } from './use-action-error'

export type LikePatch = { likeCount: number; likedByMe: boolean }

export type FeedStatus = 'loading' | 'ready' | 'error'

type TimelineState = {
  status: FeedStatus
  photos: GuestPhoto[]
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

function applyLike<P extends GuestPhoto>(photos: P[], id: string, patch: LikePatch): P[] {
  return photos.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo))
}

/**
 * タイムライン（新しい順）。`mine` で自分の投稿に絞り込む。切り替えると最初から読み込み直す。
 * `loadMore` は読み込み中・最後まで取得済み・失敗中は何もしない（重複して読み込まない）。
 */
export function usePhotoTimeline(tenantId: string, mine: boolean) {
  const [state, setState] = useState<TimelineState>(EMPTY_TIMELINE)
  const handleError = useApiErrorHandler()
  const handleActionError = useApiActionErrorHandler()
  const handleErrorRef = useRef(handleError)
  handleErrorRef.current = handleError
  const handleActionErrorRef = useRef(handleActionError)
  handleActionErrorRef.current = handleActionError
  // 古い応答（絞り込みを切り替える前など）を捨てるための世代
  const generation = useRef(0)
  const loadingMore = useRef(false)
  const cursor = useRef<string | null>(null)
  const status = useRef<FeedStatus>('loading')
  status.current = state.status

  const query = useCallback(() => (mine ? ({ mine: '1' } as const) : {}), [mine])

  const loadFirst = useCallback(
    async (mode: 'initial' | 'refresh') => {
      generation.current += 1
      const gen = generation.current
      loadingMore.current = false
      if (mode === 'initial') setState(EMPTY_TIMELINE)
      try {
        const response = await getPhotos(tenantId, query())
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: tenantId と mine が変わったときだけ読み込み直す
  useEffect(() => {
    void loadFirst('initial')
    return () => {
      generation.current += 1
    }
  }, [tenantId, mine])

  const loadMore = useCallback(async () => {
    if (loadingMore.current || status.current !== 'ready' || cursor.current === null) return
    loadingMore.current = true
    const gen = generation.current
    try {
      const response = await getPhotos(tenantId, { ...query(), cursor: cursor.current })
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
    /** 最初から読み込み直す（エラー表示の「もう一度試す」） */
    reload: useCallback(() => loadFirst('initial'), [loadFirst]),
    /** 一覧を残したまま最新に更新する（引っ張って更新） */
    refresh: useCallback(() => loadFirst('refresh'), [loadFirst]),
    loadMore,
    retryMore,
    patchLike: useCallback((id: string, patch: LikePatch) => {
      setState((current) => ({ ...current, photos: applyLike(current.photos, id, patch) }))
    }, []),
    remove: useCallback((id: string) => {
      setState((current) => ({
        ...current,
        photos: current.photos.filter((photo) => photo.id !== id),
      }))
    }, []),
  }
}

type RankingState = { status: FeedStatus; photos: RankedPhoto<GuestPhoto>[] }

/**
 * ランキング（上位 10 枚）。`active` になるたびに取得し直す
 * （表示するたびに最新にして、登場の演出を再生するため）。
 */
export function usePhotoRanking(tenantId: string, active: boolean) {
  const [state, setState] = useState<RankingState>({ status: 'loading', photos: [] })
  const handleError = useApiErrorHandler()
  const handleActionError = useApiActionErrorHandler()
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
        const response = await getRanking(tenantId)
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
    patchLike: useCallback((id: string, patch: LikePatch) => {
      setState((current) => ({ ...current, photos: applyLike(current.photos, id, patch) }))
    }, []),
    remove: useCallback((id: string) => {
      setState((current) => ({
        ...current,
        photos: current.photos.filter((photo) => photo.id !== id),
      }))
    }, []),
  }
}
