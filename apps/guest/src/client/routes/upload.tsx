import type { GuestMeResponse } from '@wym/shared'
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
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiClientError, getMe } from '../lib/api'
import { useApiErrorHandler } from '../lib/error-handling'
import { checkImageFile } from '../lib/image-file'
import { createResizedImages, type ResizedImages } from '../lib/resize'
import { paths, RouterLink } from '../lib/router-link'
import { uploadPhoto } from '../lib/upload'
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

/** 送信の失敗のうち、画面内に文言を出して選び直してもらうもの */
const FILE_ERROR_CODES = [
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
  'UPLOAD_LIMIT_REACHED',
] as const

/**
 * 写真を一枚、台紙に貼る見立て。空の台紙には金の写真コーナーだけがあり、
 * 選んだ写真は紙焼きとして貼られる。送信中は金の線が伸び、届いたら「寿」の朱印が押される。
 */
function UploadScreen({ tenantId, initial }: { tenantId: string; initial: GuestMeResponse }) {
  const toast = useToast()
  const handleError = useApiErrorHandler()
  const limit = initial.me.photoLimit
  const [photoCount, setPhotoCount] = useState(initial.me.photoCount)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [celebrating, setCelebrating] = useState(false)
  const cameraInput = useRef<HTMLInputElement>(null)
  const chooseInput = useRef<HTMLInputElement>(null)
  // 縮小画像は、失敗後の再送で作り直さない
  const resized = useRef<ResizedImages | null>(null)
  const abort = useRef<AbortController | null>(null)

  const remaining = Math.max(0, limit - photoCount)
  const atLimit = remaining === 0
  const sending = phase === 'sending'

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

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

  useEffect(() => () => abort.current?.abort(), [])

  const reset = useCallback(() => {
    resized.current = null
    setFile(null)
    setProgress(0)
    setPhase('idle')
  }, [])

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0]
    // 同じ写真をもう一度選べるように、選択を空にする
    event.target.value = ''
    if (!picked) return
    reset()
    setFileError(null)
    const check = await checkImageFile(picked)
    if (!check.ok) {
      setFileError(ja.errors.guest[check.code])
      return
    }
    setFile(picked)
  }

  const send = async () => {
    if (!file || sending) return
    const controller = new AbortController()
    abort.current = controller
    setPhase('sending')
    setProgress(0)
    setFileError(null)
    try {
      if (!resized.current) resized.current = await createResizedImages(file)
      const images = resized.current
      await uploadPhoto(
        tenantId,
        { original: file, ...images },
        { onProgress: setProgress, signal: controller.signal },
      )
      setPhotoCount((count) => count + 1)
      setPhase('done')
      setCelebrating(true)
      toast.show(ja.toasts.photoUploaded)
    } catch (error) {
      if (controller.signal.aborted) return
      const fileErrorCode =
        error instanceof ApiClientError
          ? FILE_ERROR_CODES.find((code) => code === error.code)
          : undefined
      if (fileErrorCode) {
        // 上限は「あと N 枚」の代わりに出る表示（atLimit）で伝える
        if (fileErrorCode === 'UPLOAD_LIMIT_REACHED') setPhotoCount(limit)
        else setFileError(ja.errors.guest[fileErrorCode])
        reset()
        return
      }
      if (handleError(error) === 'redirect') return
      setPhase('failed')
    }
  }

  const pickDisabled = atLimit || sending
  const picked = file !== null && previewUrl !== null

  return (
    <div>
      <Header tenantId={tenantId} />
      {celebrating ? (
        <UploadComplete
          onComplete={() => setCelebrating(false)}
          skipLabel={ja.common.skipAnimation}
        />
      ) : null}
      <div className="upload">
        {phase === 'done' ? (
          <div className="mount upload-done">
            {previewUrl ? (
              <figure className="mount-print">
                <img src={previewUrl} alt={ja.guest.upload.previewAlt} />
                <PhotoCorners />
                <span className="kotobuki-seal" aria-hidden="true">
                  {ja.guest.upload.seal}
                </span>
              </figure>
            ) : null}
            <h2 className="upload-done-title">{ja.guest.upload.doneHeading}</h2>
            <p className="upload-done-note">{ja.guest.upload.doneNote}</p>
            <div className="upload-done-actions">
              <Button fullWidth tone="beni" onClick={reset}>
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
              hidden
              data-testid="choose-input"
              onChange={onPick}
            />
            <div className="mount">
              {picked ? (
                <figure className="mount-print">
                  <img src={previewUrl} alt={ja.guest.upload.previewAlt} />
                  <PhotoCorners />
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
                  variant={picked ? 'secondary' : 'primary'}
                  disabled={pickDisabled}
                  onClick={() => cameraInput.current?.click()}
                >
                  <CameraIcon aria-hidden="true" strokeWidth={1.5} />
                  {ja.guest.upload.camera}
                </Button>
                <Button
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
              <p className="upload-rules">{ja.guest.upload.rules}</p>
            </div>

            {fileError ? (
              <p role="alert" className="upload-error">
                {fileError}
              </p>
            ) : null}

            {picked ? (
              <>
                {sending ? <Progress percent={progress} /> : null}
                {phase === 'failed' ? (
                  <div role="alert" className="upload-failed">
                    <p className="upload-error">{ja.guest.upload.failed}</p>
                    <Button variant="secondary" onClick={() => void send()}>
                      {ja.guest.upload.retry}
                    </Button>
                  </div>
                ) : (
                  <Button fullWidth tone="beni" loading={sending} onClick={() => void send()}>
                    {ja.guest.upload.submit}
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

function Progress({ percent }: { percent: number }) {
  return (
    <div className="upload-progress">
      <div className="upload-progress-head">
        <span>{ja.guest.upload.sending}</span>
        <span className="upload-progress-value">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={ja.guest.upload.sending}
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
