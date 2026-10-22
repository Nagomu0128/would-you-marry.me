import type { CoupleLoginStateResponse } from '@wym/shared'
import {
  Button,
  Checkbox,
  CoupleCelebration,
  ErrorState,
  ja,
  MizuhikiKnot,
  Skeleton,
  TextField,
} from '@wym/ui'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiClientError, getCoupleLoginState, postCoupleLogin } from '../lib/api'
import { useApiErrorHandler } from '../lib/error-handling'
import { paths } from '../lib/router-link'
import { useApiResource } from '../lib/use-api-resource'
import { hasPlayedCelebration, markCelebrationPlayed } from '../lib/welcome-storage'

// SC-01 パスコード入力
export function CoupleLoginRoute() {
  const { tenantId = '' } = useParams()
  const state = useApiResource(() => getCoupleLoginState(tenantId), [tenantId], {
    audience: 'couple',
  })

  if (state.state === 'loading') {
    return (
      <div className="flex flex-col items-center gap-4 px-screen py-6">
        <Skeleton className="h-[13.5rem] w-[min(100%,18rem)] rounded-none" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="mt-6 h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  if (state.state === 'error') return <ErrorState onRetry={state.reload} />
  return <CoupleLoginForm tenantId={tenantId} initial={state.data} />
}

/** ロック中の表示に使う、待ち時間（分。切り上げ）と解除する時刻 */
type Lock = { minutes: number; until: number }

function CoupleLoginForm({
  tenantId,
  initial,
}: {
  tenantId: string
  initial: CoupleLoginStateResponse
}) {
  const navigate = useNavigate()
  const handleError = useApiErrorHandler({ audience: 'couple' })
  const needsConsent = initial.needsTermsAgreement

  const [passcode, setPasscode] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [passcodeError, setPasscodeError] = useState<string | undefined>()
  const [termsError, setTermsError] = useState<string | undefined>()
  const [lock, setLock] = useState<Lock | null>(null)
  const [network, setNetwork] = useState(false)
  const [celebrating, setCelebrating] = useState(false)

  // 待ち時間が過ぎたら、入力できるように戻す
  useEffect(() => {
    if (!lock) return
    const timer = window.setTimeout(
      () => {
        setLock(null)
        setPasscodeError(undefined)
      },
      Math.max(0, lock.until - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [lock])

  const locked = lock !== null
  const canSubmit = (!needsConsent || agreed) && !submitting && !locked

  const goToPhotos = () => navigate(paths.couplePhotos(tenantId), { replace: true })

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!canSubmit) return
    const value = passcode.trim()
    if (value === '') {
      setPasscodeError(ja.errors.validation.passcodeEmpty)
      return
    }
    setSubmitting(true)
    setNetwork(false)
    setPasscodeError(undefined)
    setTermsError(undefined)
    try {
      await postCoupleLogin(tenantId, {
        passcode: value,
        ...(needsConsent ? { agreeToTerms: true } : {}),
      })
      // 初めて入ったときは、お祝いの演出を再生してから写真一覧へ
      if (hasPlayedCelebration(tenantId)) goToPhotos()
      else setCelebrating(true)
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'PASSCODE_INVALID') {
        setPasscodeError(
          ja.errors.couple.PASSCODE_INVALID({
            remainingAttempts: error.detail.remainingAttempts ?? 0,
          }),
        )
      } else if (error instanceof ApiClientError && error.code === 'PASSCODE_LOCKED') {
        const seconds = error.detail.retryAfterSeconds ?? 0
        const minutes = Math.max(1, Math.ceil(seconds / 60))
        setPasscodeError(ja.errors.couple.PASSCODE_LOCKED({ minutes }))
        setLock({ minutes, until: Date.now() + seconds * 1000 })
      } else if (error instanceof ApiClientError && error.code === 'TERMS_NOT_AGREED') {
        setTermsError(ja.errors.couple.TERMS_NOT_AGREED)
      } else if (error instanceof ApiClientError && error.code === 'VALIDATION_ERROR') {
        setPasscodeError(ja.errors.validation.passcodeEmpty)
      } else if (handleError(error) === 'network') {
        setNetwork(true)
      }
      setSubmitting(false)
    }
  }

  return (
    <div>
      <section className="tsutsumi-scene">
        <div className="tsutsumi">
          <h1 className="tsutsumi-omote">{ja.couple.entry.heading}</h1>
          <span className="tsutsumi-band" aria-hidden="true">
            <MizuhikiKnot strands="five" className="tsutsumi-knot" />
          </span>
        </div>
        <p className="tsutsumi-to">{initial.tenantName}</p>
        <p className="tsutsumi-note">{ja.couple.entry.note}</p>
      </section>
      <form onSubmit={submit} className="entry-form">
        <p className="entry-form-description">{ja.couple.entry.description}</p>
        <TextField
          label={ja.couple.entry.passcodeLabel}
          value={passcode}
          onChange={(event) => {
            setPasscode(event.target.value)
            if (!locked) setPasscodeError(undefined)
          }}
          // ワンタイムコードとして扱われないよう autocomplete は使わない。入力は大文字にそろえる
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          disabled={locked}
          error={passcodeError}
        />
        {needsConsent ? (
          <Checkbox
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            error={termsError}
            label={
              <>
                <Link to={paths.terms} target="_blank" className="text-accent underline">
                  {ja.guest.nickname.agree.terms}
                </Link>
                {ja.guest.nickname.agree.between}
                <Link to={paths.privacy} target="_blank" className="text-accent underline">
                  {ja.guest.nickname.agree.privacy}
                </Link>
                {ja.guest.nickname.agree.after}
              </>
            }
          />
        ) : null}
        <Button type="submit" fullWidth tone="beni" disabled={!canSubmit} loading={submitting}>
          {ja.couple.entry.submit}
        </Button>
        {network ? <ErrorState onRetry={() => void submit()} /> : null}
      </form>
      {celebrating ? (
        <CoupleCelebration
          tenantName={initial.tenantName}
          skipLabel={ja.common.skipAnimation}
          onComplete={() => {
            markCelebrationPlayed(tenantId)
            goToPhotos()
          }}
        />
      ) : null}
    </div>
  )
}
