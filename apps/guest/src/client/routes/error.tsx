import { isErrorCode } from '@wym/shared'
import { errorMessage, ja, Orizuru } from '@wym/ui'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useContactEmail } from '../lib/config'

// SG-E1 / SC-E1 エラー。`?code=` の文言を出す。`?audience=couple` は新郎新婦向けの文言
// 同じ紙の上で静かに伝える。折り鶴を小さく添える
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

  useEffect(() => {
    document.title = heading
  }, [heading])

  return (
    <div className="error-page">
      <Orizuru tone="kinu" className="error-orizuru" />
      <span className="error-rule" aria-hidden="true" />
      <h1 className="error-title">{heading}</h1>
      {detail ? <p className="error-detail">{detail}</p> : null}
      {contactEmail ? (
        <a href={`mailto:${contactEmail}`} className="ui-button" data-variant="secondary">
          {ja.common.footer.contact}
        </a>
      ) : null}
    </div>
  )
}
