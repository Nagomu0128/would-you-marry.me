import {
  countNicknameChars,
  type GuestMeResponse,
  NICKNAME_MAX_LENGTH,
  validateNickname,
} from '@wym/shared'
import {
  Button,
  Checkbox,
  ErrorState,
  GuestbookSheet,
  ja,
  MizuhikiKnot,
  ScreenHeader,
  Skeleton,
  useOrizuruSequence,
  useToast,
} from '@wym/ui'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiClientError, getMe, putNickname } from '../lib/api'
import { resolveApiError, useApiErrorHandler } from '../lib/error-handling'
import { paths, RouterLink } from '../lib/router-link'
import { useApiResource } from '../lib/use-api-resource'

// SG-02 ニックネーム登録・変更（受付の芳名帳）
export function NicknameRoute() {
  const { tenantId = '' } = useParams()
  const me = useApiResource(() => getMe(tenantId), [tenantId])

  if (me.state === 'loading') {
    return (
      <div className="flex flex-col gap-4 px-screen py-8">
        <Skeleton className="mx-auto h-8 w-1/2" />
        <Skeleton className="aspect-[360/252] w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  if (me.state === 'error') return <ErrorState onRetry={me.reload} />
  return <NicknameForm tenantId={tenantId} initial={me.data} />
}

/** 式の日付（2026-10-31 → 2026.10.31） */
function formatDate(date: string): string {
  return date.replaceAll('-', '.')
}

function NicknameForm({ tenantId, initial }: { tenantId: string; initial: GuestMeResponse }) {
  const navigate = useNavigate()
  const toast = useToast()
  const handleError = useApiErrorHandler()
  const isFirst = initial.me.nickname === null
  const needsConsent = !initial.me.termsAgreed
  // 送信すると、記帳した紙が折り鶴になって飛び立つ。通信はその間に並行して行う
  const orizuru = useOrizuruSequence(isFirst ? 'register' : 'change')
  const fieldId = useId()
  const termsId = `${fieldId}-terms`
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`
  const countId = `${fieldId}-count`
  const inputRef = useRef<HTMLInputElement>(null)

  const [value, setValue] = useState(initial.me.nickname ?? '')
  // 芳名帳に書き写す名前。日本語入力の変換中は、確定してから書く
  const [written, setWritten] = useState(value)
  const composing = useRef(false)
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [nicknameError, setNicknameError] = useState<string | undefined>()
  const [termsError, setTermsError] = useState<string | undefined>()
  const [network, setNetwork] = useState(false)
  // 二重送信を防ぐ（状態の更新を待たずに、同じ操作の二度目を止める）
  const busy = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const validation = validateNickname(value)
  const count = countNicknameChars(value.trim())
  const lengthError =
    !validation.ok && validation.field === 'TOO_LONG'
      ? ja.errors.validation.nicknameTooLong
      : undefined
  const error = nicknameError ?? lengthError
  const canSubmit = validation.ok && (!needsConsent || agreed) && !submitting

  const showError = (failure: unknown) => {
    if (failure instanceof ApiClientError && failure.code === 'NICKNAME_TAKEN') {
      setNicknameError(ja.errors.guest.NICKNAME_TAKEN)
    } else if (failure instanceof ApiClientError && failure.code === 'TERMS_NOT_AGREED') {
      setTermsError(ja.errors.guest.TERMS_NOT_AGREED)
      document.getElementById(termsId)?.focus()
      return
    } else if (failure instanceof ApiClientError && failure.code === 'VALIDATION_ERROR') {
      setNicknameError(
        failure.detail.fields?.nickname === 'TOO_LONG'
          ? ja.errors.validation.nicknameTooLong
          : ja.errors.validation.nicknameEmpty,
      )
    } else if (handleError(failure) === 'network') {
      setNetwork(true)
    }
    inputRef.current?.focus()
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (busy.current || !validation.ok || (needsConsent && !agreed)) return
    busy.current = true
    setSubmitting(true)
    setNetwork(false)
    setNicknameError(undefined)
    setTermsError(undefined)
    setWritten(value)
    // キーボードを閉じて、紙が折られるところを見せる
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    orizuru.begin()
    try {
      await putNickname(tenantId, {
        nickname: validation.value,
        ...(needsConsent ? { agreeToTerms: true } : {}),
      })
      // 鶴が画面の外へ出てから移る。初回はホームでウェルカム演出が続く
      await orizuru.depart()
      if (!alive.current) return
      if (!isFirst) toast.show(ja.toasts.nicknameChanged)
      navigate(paths.home(tenantId), { replace: isFirst })
    } catch (failure) {
      if (resolveApiError(failure, { tenantId }).type === 'redirect') {
        handleError(failure)
        return
      }
      // 鶴が降りてきて紙に戻ってから、入力を残したままエラーを出す
      await orizuru.restore()
      if (!alive.current) return
      busy.current = false
      setSubmitting(false)
      showError(failure)
    }
  }

  return (
    <div>
      {isFirst ? null : (
        <ScreenHeader
          title={ja.guest.nickname.changeHeading}
          backHref={paths.home(tenantId)}
          LinkComponent={RouterLink}
        />
      )}
      <div className="px-screen">
        {isFirst ? (
          <header className="oz-invite">
            <MizuhikiKnot strands="three" className="oz-invite-knot" width={68} height={56} />
            <h1 className="oz-invite-names">{initial.tenant.name}</h1>
            <p className="oz-invite-date wa-kin-rule">
              <time className="font-numeral" dateTime={initial.tenant.eventDate}>
                {formatDate(initial.tenant.eventDate)}
              </time>
            </p>
            <p className="oz-invite-welcome">{ja.guest.nickname.welcomeHeading}</p>
            <p className="oz-invite-guide">{ja.guest.nickname.welcomeDescription}</p>
          </header>
        ) : null}
        <form onSubmit={submit} className="oz-form" noValidate>
          <GuestbookSheet
            name={written}
            heading={ja.guest.nickname.sheetHeading}
            placeholder={ja.guest.nickname.sheetPlaceholder}
            waitingLabel={ja.guest.nickname.sending}
            sequence={orizuru}
            compact={!isFirst}
          />
          <div
            className="oz-entry"
            data-receding={orizuru.active || undefined}
            inert={orizuru.active}
          >
            <div className="oz-field">
              <label htmlFor={fieldId} className="oz-field-label">
                {ja.guest.nickname.label}
              </label>
              <p id={hintId} className="oz-field-hint">
                {ja.guest.nickname.hint}
              </p>
              <input
                ref={inputRef}
                id={fieldId}
                name="nickname"
                className="oz-field-input"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value)
                  setNicknameError(undefined)
                  if (!composing.current) setWritten(event.target.value)
                }}
                onCompositionStart={() => {
                  composing.current = true
                }}
                onCompositionEnd={(event) => {
                  composing.current = false
                  setWritten(event.currentTarget.value)
                }}
                autoComplete="nickname"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                aria-invalid={error ? true : undefined}
                aria-describedby={[hintId, error ? errorId : null, countId]
                  .filter(Boolean)
                  .join(' ')}
              />
              <div className="oz-field-foot">
                <p id={errorId} className="oz-field-error" role={error ? 'alert' : undefined}>
                  {error}
                </p>
                <p
                  id={countId}
                  className="oz-field-count font-numeral"
                  data-over={count > NICKNAME_MAX_LENGTH || undefined}
                >
                  {count} / {NICKNAME_MAX_LENGTH}
                </p>
              </div>
            </div>
            {needsConsent ? (
              <Checkbox
                id={termsId}
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
            <Button type="submit" fullWidth disabled={!canSubmit} loading={submitting}>
              {isFirst ? ja.guest.nickname.welcomeSubmit : ja.guest.nickname.changeSubmit}
            </Button>
            {network ? <ErrorState onRetry={() => void submit()} /> : null}
          </div>
          <p className="sr-only-text" role="status">
            {submitting ? ja.guest.nickname.sending : ''}
          </p>
        </form>
      </div>
    </div>
  )
}
