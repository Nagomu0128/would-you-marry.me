import { Brand, Button, ja, WeddingMark } from '@wym/ui'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { signInWithGoogle } from '../lib/auth'
import { messageOf } from '../lib/errors'

/** SA-01 ログイン */
export function Login() {
  const [params] = useSearchParams()
  const denied = params.get('error') === 'denied'
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    setFailed(false)
    try {
      await signInWithGoogle()
    } catch {
      setFailed(true)
      setLoading(false)
    }
  }

  return (
    <main className="screen-h layout-guest px-screen flex flex-col justify-center py-12">
      <Brand caption="The host's notebook" />
      <div className="my-8 border-y border-rule py-10">
        <WeddingMark className="mb-6 h-16 w-16" />
        <p className="eyebrow text-accent mb-3">For the hosts</p>
        <h1 className="screen-title">{ja.admin.loginTitle}</h1>
        <p className="screen-description">
          大切な一日を、細部まで。
          <br />
          結婚式の準備と、思い出の管理をここから。
        </p>
      </div>
      <Button onClick={handleClick} loading={loading} fullWidth>
        {ja.admin.login.google}
      </Button>
      {denied ? (
        <p role="alert" className="text-body text-error">
          {ja.admin.login.denied}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="text-body text-error">
          {messageOf(null)}
        </p>
      ) : null}
    </main>
  )
}
