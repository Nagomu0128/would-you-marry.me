import type { GuestMeResponse } from '@wym/shared'
import { Button, ErrorState, ja, ScreenHeader, Skeleton, UploadComplete, useToast } from '@wym/ui'
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiClientError, getMe } from '../lib/api'
import { useApiErrorHandler } from '../lib/error-handling'
import { checkImageFile } from '../lib/image-file'
import { createResizedImages, type ResizedImages } from '../lib/resize'
import { paths, RouterLink } from '../lib/router-link'
import { uploadPhoto } from '../lib/upload'
import { useApiResource } from '../lib/use-api-resource'

// SG-07 フォトアップロード
export function UploadRoute() {
  const { tenantId = '' } = useParams()
  const me = useApiResource(() => getMe(tenantId), [tenantId])

  if (me.state === 'loading') {
    return (
      <div>
        <Header tenantId={tenantId} />
        <div className="flex flex-col gap-4 px-screen py-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-5 w-1/2" />
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

  return (
    <div>
      <Header tenantId={tenantId} />
      {celebrating ? (
        <UploadComplete
          onComplete={() => setCelebrating(false)}
          skipLabel={ja.common.skipAnimation}
        />
      ) : null}
      <div className="flex flex-col gap-4 px-screen py-6">
        {phase === 'done' ? (
          <div className="flex flex-col gap-3">
            <Button fullWidth onClick={reset}>
              {ja.guest.upload.another}
            </Button>
            <Link
              to={paths.album(tenantId)}
              className="inline-flex h-control items-center justify-center rounded-control border border-charcoal text-body font-semibold text-charcoal"
            >
              {ja.guest.upload.toAlbum}
            </Link>
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
            <div className="flex flex-col gap-3">
              <Button
                variant="secondary"
                fullWidth
                disabled={pickDisabled}
                onClick={() => cameraInput.current?.click()}
              >
                {ja.guest.upload.camera}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                disabled={pickDisabled}
                onClick={() => chooseInput.current?.click()}
              >
                {ja.guest.upload.choose}
              </Button>
            </div>
            {atLimit ? (
              <p role="status" className="text-small text-error">
                {ja.errors.guest.UPLOAD_LIMIT_REACHED}
              </p>
            ) : (
              <p className="text-small text-warm-gray">{ja.guest.album.remaining({ remaining })}</p>
            )}
            {fileError ? (
              <p role="alert" className="text-small text-error">
                {fileError}
              </p>
            ) : null}
            {file && previewUrl ? (
              <div className="flex flex-col gap-4">
                <img
                  src={previewUrl}
                  alt={ja.guest.upload.previewAlt}
                  className="max-h-96 w-full rounded-card bg-sand object-contain"
                />
                {sending ? <Progress percent={progress} /> : null}
                {phase === 'failed' ? (
                  <div role="alert" className="flex flex-col items-center gap-3 text-center">
                    <p className="text-body text-error">{ja.guest.upload.failed}</p>
                    <Button variant="secondary" onClick={() => void send()}>
                      {ja.guest.upload.retry}
                    </Button>
                  </div>
                ) : (
                  <Button fullWidth loading={sending} onClick={() => void send()}>
                    {ja.guest.upload.submit}
                  </Button>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function Progress({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-3 text-small text-warm-gray">
      <span>{ja.guest.upload.sending}</span>
      <div
        role="progressbar"
        aria-label={ja.guest.upload.sending}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 flex-1 overflow-hidden rounded-full bg-sand"
      >
        <div className="h-full bg-champagne transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <span className="w-10 text-right tabular-nums">{percent}%</span>
    </div>
  )
}
