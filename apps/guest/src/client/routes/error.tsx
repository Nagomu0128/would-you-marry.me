import { isErrorCode } from '@wym/shared'
import { errorMessage, ja } from '@wym/ui'
import { useSearchParams } from 'react-router'
import { useContactEmail } from '../lib/config'

// SG-E1 / SC-E1 エラー。`?code=` の文言を出す。`?audience=couple` は新郎新婦向けの文言
export function ErrorRoute() {
  const [params] = useSearchParams()
  const contactEmail = useContactEmail()
  const code = params.get('code')
  const audience = params.get('audience') === 'couple' ? 'couple' : 'guest'
  const message =
    (isErrorCode(code) ? errorMessage(code, audience) : null) ?? ja.errors.guest.INTERNAL_ERROR

  // 最初の一文を見出し、残りを説明にする（ワイヤーフレームの形）
  const split = message.indexOf('。')
  const heading = split === -1 ? message : message.slice(0, split)
  const rest = split === -1 ? '' : message.slice(split + 1)
  // ワイヤーフレームの説明文は文末に「。」がある
  const detail = rest && !rest.endsWith('。') ? `${rest}。` : rest

  return (
    <div className="flex flex-col items-center gap-4 px-screen py-16 text-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="48"
        height="48"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="text-champagne"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <h1 className="text-heading-md">{heading}</h1>
      {detail ? <p className="text-body text-warm-gray">{detail}</p> : null}
      {contactEmail ? (
        <a
          href={`mailto:${contactEmail}`}
          className="mt-4 inline-flex h-control min-w-tap items-center justify-center rounded-control border border-charcoal px-6 text-body font-semibold text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne"
        >
          {ja.common.footer.contact}
        </a>
      ) : null}
    </div>
  )
}
