import { type GuestMeResponse, UPLOAD_CONSECUTIVE_FAILURES_MAX } from '@wym/shared'
import {
  Button,
  CameraIcon,
  ErrorState,
  ImagesIcon,
  ja,
  Orizuru,
  ScreenHeader,
  Skeleton,
  UploadComplete,
  useToast,
} from '@wym/ui'
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react'
import { Link, useParams } from 'react-router'
import { ApiClientError, getMe } from '../lib/api'
import { useApiErrorHandler } from '../lib/error-handling'
import { checkImageFile } from '../lib/image-file'
import { createResizedImages, type ResizedImages } from '../lib/resize'
import { paths, RouterLink } from '../lib/router-link'
import { uploadPhoto } from '../lib/upload'
import { createUploadKey } from '../lib/upload-key'
import {
  type FileRejection,
  focusAfterRemove,
  fullReason,
  isFileRejection,
  overallPercent,
  pendingCount,
  planAdd,
  type QueueItem,
  queueLimit,
  queueReducer,
  type RejectionNotice,
  rejectionNotice,
  roomLeft,
} from '../lib/upload-queue'
import { useApiResource } from '../lib/use-api-resource'

/** 写真の四隅を留める金の写真コーナー（装飾） */
function PhotoCorners() {
  return (
    <span className="photo-corners" aria-hidden="true">
      <span data-corner="tl" />
      <span data-corner="tr" />
      <span data-corner="bl" />
      <span data-corner="br" />
    </span>
  )
}

/** 「外す」ボタンの丸い札（装飾）。× は墨の細い線で描く */
function RemoveMark() {
  return (
    <span className="upload-item-remove-mark" aria-hidden="true">
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5" />
      </svg>
    </span>
  )
}

// SG-07 フォトアップロード
export function UploadRoute() {
  const { tenantId = '' } = useParams()
  const me = useApiResource(() => getMe(tenantId), [tenantId])

  if (me.state === 'loading') {
    return (
      <div>
        <Header tenantId={tenantId} />
        <div className="upload">
          <Skeleton className="h-[26rem] w-full rounded-none" />
          <Skeleton className="mx-auto h-5 w-1/2" />
        </div>
      </div>
    )
  }
  if (me.state === 'error') {
    return (
      <div>
        <Header tenantId={tenantId} />
        <ErrorState onRetry={me.reload} />
      </div>
    )
  }
  return <UploadScreen tenantId={tenantId} initial={me.data} />
}

function Header({ tenantId }: { tenantId: string }) {
  return (
    <ScreenHeader
      title={ja.guest.upload.heading}
      description={ja.guest.upload.lead}
      backHref={paths.home(tenantId)}
      LinkComponent={RouterLink}
    />
  )
}

type Phase = 'idle' | 'sending' | 'failed' | 'done'

/** 一度の送信のまとまりの進み */
type Run = { total: number; current: number; done: number }

/** 完了の台紙に重ねる写真の最大枚数 */
const PILE_MAX = 3

const NO_ITEMS: readonly QueueItem[] = []

/** 縮小の待ち行列に載っている写真 1 枚分 */
type Entry = {
  file: File
  resized: ResizedImages | null
  /** 縮小の結果。失敗したら null に戻し、再送のときに作り直す */
  prepared: Promise<ResizedImages> | null
  removed: boolean
  /** 投稿キー（D-41）。この写真の再送でも同じ値を送る */
  uploadKey: string
}

/**
 * 選んだ写真の一覧と、その縮小・送信。
 * - 縮小は選んだ直後から 1 枚ずつ順に、バックグラウンドで進める。結果は写真ごとに持ち、再送では作り直さない
 * - 送信は 1 枚ずつ順に行う（同時に 2 つの送信は出さない）。送信のループは 1 本だけ動く
 * - object URL は、外す・送れた・リセット・画面を離れるときに手放す
 */
function useUploadQueue(tenantId: string, limit: number, initialCount: number) {
  const toast = useToast()
  const handleError = useApiErrorHandler()
  const [items, dispatch] = useReducer(queueReducer, NO_ITEMS)
  const [photoCount, setPhotoCount] = useState(initialCount)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [run, setRun] = useState<Run | null>(null)
  const [notice, setNotice] = useState<RejectionNotice | null>(null)
  const [capNotice, setCapNotice] = useState<string | null>(null)
  const [thumbs, setThumbs] = useState<Readonly<Record<string, string>>>({})
  const [pile, setPile] = useState<readonly string[]>([])
  const [sentTotal, setSentTotal] = useState(0)
  const [celebrating, setCelebrating] = useState(false)

  // 非同期の処理から最新の値を読むための写し
  const itemsRef = useRef(items)
  itemsRef.current = items
  const photoCountRef = useRef(photoCount)
  photoCountRef.current = photoCount
  const mounted = useRef(false)
  const running = useRef(false)
  const abort = useRef<AbortController | null>(null)
  const entries = useRef(new Map<string, Entry>())
  const prepChain = useRef<Promise<void>>(Promise.resolve())
  const thumbUrls = useRef(new Map<string, string>())
  const pileRef = useRef<readonly string[]>([])
  const sentTotalRef = useRef(0)
  const nextId = useRef(0)

  // 画面に出た時点（描画と同じコミット）で「表示中」にする。useEffect だと、描画から effect が
  // 走るまでの間に写真を選ばれたとき、add が「画面を離れた」と判断して選んだ写真を捨ててしまう
  useLayoutEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    const urls = thumbUrls.current
    const entryMap = entries.current
    return () => {
      abort.current?.abort()
      for (const entry of entryMap.values()) entry.removed = true
      entryMap.clear()
      for (const url of urls.values()) URL.revokeObjectURL(url)
      urls.clear()
      for (const url of pileRef.current) URL.revokeObjectURL(url)
      pileRef.current = []
    }
  }, [])

  const sending = phase === 'sending'

  // 送信中に画面を離れようとしたら警告する
  useEffect(() => {
    if (!sending) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [sending])

  /** 一覧用の縮小画像の URL を作る。外された写真には作らない */
  const attachThumb = useCallback((id: string, blob: Blob) => {
    if (!mounted.current) return
    const url = URL.createObjectURL(blob)
    thumbUrls.current.set(id, url)
    setThumbs((prev) => ({ ...prev, [id]: url }))
  }, [])

  /** 写真 1 枚分の縮小画像と URL を手放す（完了の台紙に残すものは、URL を残す） */
  const release = useCallback((id: string) => {
    const entry = entries.current.get(id)
    if (entry) {
      entry.removed = true
      entry.resized = null
      entry.prepared = null
      entries.current.delete(id)
    }
    const url = thumbUrls.current.get(id)
    if (url) {
      thumbUrls.current.delete(id)
      if (!pileRef.current.includes(url)) URL.revokeObjectURL(url)
    }
    if (mounted.current) {
      setThumbs((prev) => {
        if (!(id in prev)) return prev
        const { [id]: _removed, ...rest } = prev
        return rest
      })
    }
  }, [])

  /** 縮小画像を用意する。縮小は 1 枚ずつ順に行い、できていれば（途中でも）その結果を返す */
  const prepare = useCallback(
    (id: string): Promise<ResizedImages> => {
      const entry = entries.current.get(id)
      if (!entry) return Promise.reject(new Error('photo removed'))
      if (entry.prepared) return entry.prepared
      const task = prepChain.current.then(async () => {
        if (entry.removed) throw new Error('photo removed')
        const images = await createResizedImages(entry.file)
        // 縮小中に外された写真の結果は捨てる
        if (entry.removed) throw new Error('photo removed')
        entry.resized = images
        attachThumb(id, images.thumb)
        return images
      })
      entry.prepared = task
      prepChain.current = task.then(
        () => undefined,
        () => undefined,
      )
      task.catch(() => {
        if (entry.prepared === task) entry.prepared = null
      })
      return task
    },
    [attachThumb],
  )

  const remaining = Math.max(0, limit - photoCount)

  const add = useCallback(
    async (picked: File[]) => {
      if (picked.length === 0 || running.current) return
      setNotice(null)
      setCapNotice(null)
      const checks = await Promise.all(
        picked.map(async (file) => ({ file, check: await checkImageFile(file) })),
      )
      if (!mounted.current || running.current) return
      const valid: File[] = []
      const rejected: FileRejection[] = []
      for (const { file, check } of checks) {
        if (check.ok) valid.push(file)
        else rejected.push(check.code)
      }
      if (rejected.length > 0) setNotice(rejectionNotice(picked.length, rejected))
      if (valid.length === 0) return

      const remainingNow = Math.max(0, limit - photoCountRef.current)
      const plan = planAdd(valid.length, pendingCount(itemsRef.current), remainingNow)
      if (plan.accepted === 0) return
      if (plan.cappedBy === 'batch') {
        setCapNotice(ja.guest.upload.cappedByBatch({ added: plan.accepted }))
      } else if (plan.cappedBy === 'remaining') {
        setCapNotice(
          ja.guest.upload.cappedByRemaining({ remaining: remainingNow, added: plan.accepted }),
        )
      }
      const added: QueueItem[] = valid.slice(0, plan.accepted).map((file) => {
        nextId.current += 1
        return { id: `photo-${nextId.current}`, file, status: 'waiting' }
      })
      for (const item of added) {
        entries.current.set(item.id, {
          file: item.file,
          resized: null,
          prepared: null,
          removed: false,
          uploadKey: createUploadKey(),
        })
      }
      dispatch({ type: 'add', items: added, limit: queueLimit(remainingNow) })
      // 失敗した写真があったときは、加えた写真と一緒にもう一度送る
      setPhase((current) => (current === 'failed' ? 'idle' : current))
      for (const item of added) prepare(item.id).catch(() => undefined)
    },
    [limit, prepare],
  )

  const remove = useCallback(
    (id: string) => {
      if (running.current) return
      const rest = itemsRef.current.filter((item) => item.id !== id).length
      dispatch({ type: 'remove', id })
      release(id)
      setCapNotice(null)
      if (rest === 0) setPhase((current) => (current === 'failed' ? 'idle' : current))
    },
    [release],
  )

  /** 完了の台紙・手元の一覧をすべて空に戻す */
  const reset = useCallback(() => {
    for (const item of itemsRef.current) release(item.id)
    for (const url of pileRef.current) URL.revokeObjectURL(url)
    pileRef.current = []
    sentTotalRef.current = 0
    setPile([])
    setSentTotal(0)
    dispatch({ type: 'reset' })
    setProgress(0)
    setRun(null)
    setNotice(null)
    setCapNotice(null)
    setPhase('idle')
  }, [release])

  const send = useCallback(async () => {
    if (running.current) return
    const queue = itemsRef.current.filter((item) => item.status !== 'sent')
    if (queue.length === 0) return
    running.current = true
    const controller = new AbortController()
    abort.current = controller
    const { signal } = controller
    const total = queue.length
    dispatch({ type: 'begin' })
    setPhase('sending')
    setProgress(0)
    setNotice(null)
    setCapNotice(null)

    const finish = () => {
      if (sentTotalRef.current > 0) {
        setPhase('done')
        setCelebrating(true)
      } else {
        setPhase('idle')
      }
    }
    let sentNow = 0
    const sentIds: string[] = []
    const rejected: FileRejection[] = []
    let stop: 'limit' | 'redirect' | null = null
    // 応答が返らない・通信できない失敗が続いた数（D-42）
    let consecutiveFailures = 0
    try {
      for (const [index, item] of queue.entries()) {
        if (signal.aborted) return
        setRun({ total, current: index + 1, done: sentNow })
        setProgress(0)
        dispatch({ type: 'status', id: item.id, status: 'sending' })
        try {
          const images = await prepare(item.id)
          await uploadPhoto(
            tenantId,
            { original: item.file, ...images },
            {
              onProgress: setProgress,
              signal,
              uploadKey: entries.current.get(item.id)?.uploadKey,
            },
          )
          if (signal.aborted) return
          consecutiveFailures = 0
          sentNow += 1
          sentIds.push(item.id)
          sentTotalRef.current += 1
          setSentTotal(sentTotalRef.current)
          setPhotoCount((count) => count + 1)
          // 送れた写真の縮小画像は手放す。完了の台紙と演出に重ねる 3 枚だけは、
          // 高精細の画面でも粗く見えないよう拡大表示用（長辺 1,600px）の URL を作って残す
          const entry = entries.current.get(item.id)
          if (entry) entry.resized = null
          if (mounted.current && pileRef.current.length < PILE_MAX) {
            pileRef.current = [...pileRef.current, URL.createObjectURL(images.display)]
            setPile(pileRef.current)
          }
          dispatch({ type: 'status', id: item.id, status: 'sent' })
        } catch (error) {
          if (signal.aborted) return
          const code = error instanceof ApiClientError ? error.code : undefined
          if (code === 'UPLOAD_LIMIT_REACHED') {
            stop = 'limit'
            break
          }
          if (isFileRejection(code)) {
            consecutiveFailures = 0
            rejected.push(code)
            dispatch({ type: 'remove', id: item.id })
            release(item.id)
            continue
          }
          if (handleError(error) === 'redirect') {
            stop = 'redirect'
            break
          }
          dispatch({ type: 'status', id: item.id, status: 'failed' })
          consecutiveFailures += 1
          if (consecutiveFailures >= UPLOAD_CONSECUTIVE_FAILURES_MAX) {
            // 残りは送らずに失敗として残す。「もう一度送る」で送り直せる
            dispatch({ type: 'failWaiting' })
            break
          }
        }
      }

      if (signal.aborted) return
      setProgress(0)
      setRun(null)
      for (const id of sentIds) release(id)

      if (stop === 'redirect') {
        dispatch({ type: 'interrupt' })
        setPhase('idle')
        return
      }
      if (sentNow > 0) {
        toast.show(
          sentNow === 1 ? ja.toasts.photoUploaded : ja.toasts.photosUploaded({ count: sentNow }),
        )
      }
      if (stop === 'limit') {
        // 上限に達したので、送っていない写真は捨てて、上限の表示（残り枚数 0）にする
        for (const item of queue) release(item.id)
        reset()
        setPhotoCount(limit)
        if (rejected.length > 0) setNotice(rejectionNotice(total, rejected))
        return
      }
      if (rejected.length > 0) setNotice(rejectionNotice(total, rejected))
      dispatch({ type: 'keepFailed' })
      if (sentNow + rejected.length < total) setPhase('failed')
      else finish()
    } finally {
      running.current = false
    }
  }, [tenantId, limit, prepare, release, reset, handleError, toast])

  return {
    items,
    photoCount,
    remaining,
    phase,
    sending,
    progress,
    run,
    notice,
    capNotice,
    thumbs,
    pile,
    sentTotal,
    celebrating,
    stopCelebrating: useCallback(() => setCelebrating(false), []),
    add,
    remove,
    reset,
    send,
  }
}

/**
 * 写真を台紙に貼る見立て。空の台紙には金の写真コーナーだけがあり、選んだ写真は紙焼きとして貼られる。
 * 2 枚以上は一覧用の縮小画像を 3 列に並べる。送信中は金の線が伸び、届いたら「寿」の朱印が押される。
 */
function UploadScreen({ tenantId, initial }: { tenantId: string; initial: GuestMeResponse }) {
  const limit = initial.me.photoLimit
  const queue = useUploadQueue(tenantId, limit, initial.me.photoCount)
  const { items, phase, sending, remaining, run, thumbs, pile } = queue
  const cameraInput = useRef<HTMLInputElement>(null)
  const chooseInput = useRef<HTMLInputElement>(null)
  const chooseButton = useRef<HTMLButtonElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const focusRequest = useRef<number | 'choose' | null>(null)

  const atLimit = remaining === 0
  const pending = pendingCount(items)
  const full = fullReason(pending, remaining)
  const pickDisabled = atLimit || sending || roomLeft(pending, remaining) === 0
  const multi = items.length > 1

  // 1 枚のときだけ、大きな台紙にオリジナルを出す。2 枚以上ではオリジナルをデコードしない
  const single = items.length === 1 ? (items[0]?.file ?? null) : null
  const [singleUrl, setSingleUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!single) {
      setSingleUrl(null)
      return
    }
    const url = URL.createObjectURL(single)
    setSingleUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [single])

  // 外したあとのフォーカス。次の写真の「外す」ボタン、なければ「写真を選ぶ」ボタン
  // biome-ignore lint/correctness/useExhaustiveDependencies: 一覧が変わったときに実行する
  useLayoutEffect(() => {
    const target = focusRequest.current
    if (target === null) return
    focusRequest.current = null
    const buttons = mountRef.current?.querySelectorAll<HTMLButtonElement>('.upload-item-remove')
    if (target !== 'choose' && buttons?.[target]) buttons[target].focus()
    else chooseButton.current?.focus()
  }, [items])

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? [])
    // 同じ写真をもう一度選べるように、選択を空にする
    event.target.value = ''
    void queue.add(picked)
  }

  const onRemove = (id: string, index: number) => {
    focusRequest.current = focusAfterRemove(items.length - 1, index)
    queue.remove(id)
  }

  const submitLabel = multi
    ? ja.guest.upload.submitMany({ count: items.length })
    : ja.guest.upload.submit
  const sendingLabel = isBatchRun(run) ? ja.guest.upload.sendingCount(run) : ja.guest.upload.sending
  const percent = run ? overallPercent(run.done, run.total, queue.progress) : queue.progress
  const failedCount = items.filter((item) => item.status === 'failed').length
  const showStatus = phase !== 'idle'

  return (
    <div>
      <Header tenantId={tenantId} />
      {queue.celebrating ? (
        <UploadComplete
          onComplete={queue.stopCelebrating}
          skipLabel={ja.common.skipAnimation}
          photoSrc={pile[0]}
          extraPhotoSrcs={pile.slice(1, PILE_MAX)}
          photoCount={queue.sentTotal}
        />
      ) : null}
      <div className="upload">
        {queue.notice ? (
          <div role="alert" className="upload-error-list">
            {queue.notice.count !== null ? (
              <p className="upload-error">
                {ja.guest.upload.rejected({ count: queue.notice.count })}
              </p>
            ) : null}
            {queue.notice.reasons.map((code) => (
              <p key={code} className="upload-error">
                {ja.errors.guest[code]}
              </p>
            ))}
          </div>
        ) : null}
        {phase === 'done' ? (
          <div className="mount upload-done">
            <div className="mount-pile">
              {pile.map((src, index) => (
                <figure className="mount-print" key={src}>
                  <img
                    src={src}
                    alt={
                      pile.length > 1
                        ? ja.guest.upload.previewAltIndexed({ index: index + 1 })
                        : ja.guest.upload.previewAlt
                    }
                  />
                  <PhotoCorners />
                  {index === 0 ? (
                    <span className="kotobuki-seal" aria-hidden="true">
                      {ja.guest.upload.seal}
                    </span>
                  ) : null}
                </figure>
              ))}
            </div>
            <h2 className="upload-done-title">{ja.guest.upload.doneHeading}</h2>
            <p className="upload-done-note">
              {queue.sentTotal > 1
                ? ja.guest.upload.doneNoteMany({ count: queue.sentTotal })
                : ja.guest.upload.doneNote}
            </p>
            <div className="upload-done-actions">
              <Button fullWidth tone="beni" onClick={queue.reset}>
                {ja.guest.upload.another}
              </Button>
              <Link
                to={paths.album(tenantId)}
                className="ui-button w-full"
                data-variant="secondary"
              >
                {ja.guest.upload.toAlbum}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              data-testid="camera-input"
              onChange={onPick}
            />
            <input
              ref={chooseInput}
              type="file"
              accept="image/jpeg,image/png"
              multiple
              hidden
              data-testid="choose-input"
              onChange={onPick}
            />
            <div className="mount" ref={mountRef}>
              {multi ? (
                <>
                  <p className="upload-selected">
                    {ja.guest.upload.selected({ count: items.length })}
                  </p>
                  <ul className="upload-grid">
                    {items.map((item, index) => (
                      <UploadItem
                        key={item.id}
                        item={item}
                        index={index}
                        thumb={thumbs[item.id]}
                        showStatus={showStatus}
                        disabled={sending}
                        onRemove={onRemove}
                      />
                    ))}
                  </ul>
                </>
              ) : items[0] && singleUrl ? (
                <figure
                  className="mount-print"
                  data-status={statusOf(items[0], items[0].id in thumbs)}
                >
                  <img src={singleUrl} alt={ja.guest.upload.previewAlt} />
                  <PhotoCorners />
                  <button
                    type="button"
                    className="upload-item-remove"
                    aria-label={ja.guest.upload.remove({ index: 1 })}
                    disabled={sending}
                    onClick={() => items[0] && onRemove(items[0].id, 0)}
                  >
                    <RemoveMark />
                  </button>
                </figure>
              ) : (
                <div className="mount-slot" aria-hidden="true">
                  <PhotoCorners />
                  <Orizuru tone="line" className="mount-slot-crane" />
                  <span className="mount-slot-text">{ja.guest.upload.slot}</span>
                </div>
              )}
              <div className="upload-choices">
                <Button
                  variant={items.length > 0 ? 'secondary' : 'primary'}
                  disabled={pickDisabled}
                  onClick={() => cameraInput.current?.click()}
                >
                  <CameraIcon aria-hidden="true" strokeWidth={1.5} />
                  {ja.guest.upload.camera}
                </Button>
                <Button
                  ref={chooseButton}
                  variant="secondary"
                  disabled={pickDisabled}
                  onClick={() => chooseInput.current?.click()}
                >
                  <ImagesIcon aria-hidden="true" strokeWidth={1.5} />
                  {ja.guest.upload.choose}
                </Button>
              </div>
            </div>

            <div className="upload-meta">
              {atLimit ? (
                <p role="status" className="upload-limit">
                  {ja.errors.guest.UPLOAD_LIMIT_REACHED}
                </p>
              ) : (
                <p className="upload-remaining">{ja.guest.album.remaining({ remaining })}</p>
              )}
              {full ? (
                <p role="status" className="upload-full">
                  {full === 'batch'
                    ? ja.guest.upload.batchFull
                    : ja.guest.upload.quotaFull({ remaining })}
                </p>
              ) : null}
              {queue.capNotice ? (
                <p role="status" className="upload-capped">
                  {queue.capNotice}
                </p>
              ) : null}
              <p className="upload-rules">{ja.guest.upload.rules}</p>
            </div>

            {items.length > 0 ? (
              <>
                {sending ? (
                  <Progress label={sendingLabel} live={isBatchRun(run)} percent={percent} />
                ) : null}
                {phase === 'failed' ? (
                  <div role="alert" className="upload-failed">
                    <p className="upload-error">
                      {failedCount > 1
                        ? ja.guest.upload.failedCount({ count: failedCount })
                        : ja.guest.upload.failed}
                    </p>
                    <Button variant="secondary" onClick={() => void queue.send()}>
                      {ja.guest.upload.retry}
                    </Button>
                  </div>
                ) : (
                  <Button fullWidth tone="beni" loading={sending} onClick={() => void queue.send()}>
                    {submitLabel}
                  </Button>
                )}
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

/** 2 枚以上をまとめて送っているか */
function isBatchRun(run: Run | null): run is Run {
  return run !== null && run.total > 1
}

/** 画面に付ける状態。縮小画像（一覧用）ができるまでの待ちは preparing */
function statusOf(item: QueueItem, hasThumb: boolean): string {
  return item.status === 'waiting' && !hasThumb ? 'preparing' : item.status
}

function UploadItem({
  item,
  index,
  thumb,
  showStatus,
  disabled,
  onRemove,
}: {
  item: QueueItem
  index: number
  thumb: string | undefined
  showStatus: boolean
  disabled: boolean
  onRemove: (id: string, index: number) => void
}) {
  return (
    <li className="upload-item" data-status={statusOf(item, thumb !== undefined)}>
      {thumb ? (
        <img src={thumb} alt={ja.guest.upload.previewAltIndexed({ index: index + 1 })} />
      ) : (
        <span className="upload-item-placeholder" aria-hidden="true" />
      )}
      <PhotoCorners />
      {/* 読み上げは 写真 → 状態 → 外す の順。状態は紙焼きの下の余白に、外すは右上に置く */}
      {showStatus ? (
        <span className="upload-item-status">{ja.guest.upload.itemStatus[item.status]}</span>
      ) : null}
      {item.status === 'sent' ? (
        <span className="kotobuki-seal upload-item-seal" aria-hidden="true">
          {ja.guest.upload.seal}
        </span>
      ) : null}
      <button
        type="button"
        className="upload-item-remove"
        aria-label={ja.guest.upload.remove({ index: index + 1 })}
        disabled={disabled}
        onClick={() => onRemove(item.id, index)}
      >
        <RemoveMark />
      </button>
    </li>
  )
}

function Progress({ label, live, percent }: { label: string; live: boolean; percent: number }) {
  return (
    <div className="upload-progress">
      <div className="upload-progress-head">
        {/* 複数枚のときは何枚目かを読み上げる。割合は読み上げに入れない */}
        <span aria-live={live ? 'polite' : undefined}>{label}</span>
        <span className="upload-progress-value">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="upload-progress-track"
      >
        <div className="upload-progress-bar" style={{ inlineSize: `${percent}%` }} />
      </div>
    </div>
  )
}
