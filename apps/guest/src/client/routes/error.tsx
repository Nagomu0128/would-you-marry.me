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
    <div className="error-page">
      <div className="error-symbol" aria-hidden="true">
        &
      </div>
      <p className="eyebrow">The Wedding Journal</p>
      <h1 className="text-heading-md">{heading}</h1>
      {detail ? <p className="text-body text-muted">{detail}</p> : null}
      {contactEmail ? (
        <a href={`mailto:${contactEmail}`} className="ui-button mt-6" data-variant="primary">
          {ja.common.footer.contact}
        </a>
      ) : null}
    </div>
  )
}
