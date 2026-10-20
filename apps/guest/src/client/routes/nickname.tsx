import { countNicknameChars, type GuestMeResponse, validateNickname } from '@wym/shared'
import {
  Button,
  Checkbox,
  ErrorState,
  ja,
  ScreenHeader,
  Skeleton,
  TextField,
  useToast,
} from '@wym/ui'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiClientError, getMe, putNickname } from '../lib/api'
import { useApiErrorHandler } from '../lib/error-handling'
import { paths, RouterLink } from '../lib/router-link'
import { useApiResource } from '../lib/use-api-resource'

// SG-02 ニックネーム登録・変更
export function NicknameRoute() {
  const { tenantId = '' } = useParams()
  const me = useApiResource(() => getMe(tenantId), [tenantId])

  if (me.state === 'loading') {
    return (
      <div className="flex flex-col gap-4 px-screen py-8">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  if (me.state === 'error') return <ErrorState onRetry={me.reload} />
  return <NicknameForm tenantId={tenantId} initial={me.data} />
}

function NicknameForm({ tenantId, initial }: { tenantId: string; initial: GuestMeResponse }) {
  const navigate = useNavigate()
  const toast = useToast()
  const handleError = useApiErrorHandler()
  const isFirst = initial.me.nickname === null
  const needsConsent = !initial.me.termsAgreed

  const [value, setValue] = useState(initial.me.nickname ?? '')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [nicknameError, setNicknameError] = useState<string | undefined>()
  const [termsError, setTermsError] = useState<string | undefined>()
  const [network, setNetwork] = useState(false)

  const validation = validateNickname(value)
  const count = countNicknameChars(value.trim())
  const lengthError =
    !validation.ok && validation.field === 'TOO_LONG'
      ? ja.errors.validation.nicknameTooLong
      : undefined
  const canSubmit = validation.ok && (!needsConsent || agreed) && !submitting

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!validation.ok || !canSubmit) return
    setSubmitting(true)
    setNetwork(false)
    setNicknameError(undefined)
    setTermsError(undefined)
    try {
      await putNickname(tenantId, {
        nickname: validation.value,
        ...(needsConsent ? { agreeToTerms: true } : {}),
      })
      // 初回はホームでウェルカム演出が始まる。変更のときはトーストを出してホームに戻る
      if (!isFirst) toast.show(ja.toasts.nicknameChanged)
      navigate(paths.home(tenantId), { replace: isFirst })
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'NICKNAME_TAKEN') {
        setNicknameError(ja.errors.guest.NICKNAME_TAKEN)
      } else if (error instanceof ApiClientError && error.code === 'TERMS_NOT_AGREED') {
        setTermsError(ja.errors.guest.TERMS_NOT_AGREED)
      } else if (error instanceof ApiClientError && error.code === 'VALIDATION_ERROR') {
        setNicknameError(
          error.detail.fields?.nickname === 'TOO_LONG'
            ? ja.errors.validation.nicknameTooLong
            : ja.errors.validation.nicknameEmpty,
        )
      } else if (handleError(error) === 'network') {
        setNetwork(true)
      }
      setSubmitting(false)
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
      <form onSubmit={submit} className="flex flex-col gap-6 px-screen py-8">
        {isFirst ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="font-accent text-heading-lg">{ja.guest.nickname.welcomeHeading}</h1>
            <p className="text-body text-warm-gray">{initial.tenant.name}</p>
          </div>
        ) : null}
        <TextField
          label={isFirst ? ja.guest.nickname.welcomeDescription : ja.guest.nickname.changeHeading}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setNicknameError(undefined)
          }}
          count={count}
          max={20}
          autoComplete="off"
          error={nicknameError ?? lengthError}
        />
        {needsConsent ? (
          <Checkbox
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            error={termsError}
            label={
              <>
                <Link to={paths.terms} target="_blank" className="text-deep-gold underline">
                  {ja.guest.nickname.agree.terms}
                </Link>
                {ja.guest.nickname.agree.between}
                <Link to={paths.privacy} target="_blank" className="text-deep-gold underline">
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
      </form>
    </div>
  )
}
