import { Button, ja } from '@wym/ui'
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
    <div className="screen-h layout-admin px-screen flex flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-heading-md">{ja.admin.loginTitle}</h1>
      <Button onClick={handleClick} loading={loading}>
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
    </div>
  )
}
