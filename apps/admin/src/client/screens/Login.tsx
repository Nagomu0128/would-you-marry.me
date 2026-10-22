import { Button, ja } from '@wym/ui'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { SheetPage } from '../components/shell'
import { signInWithGoogle } from '../lib/auth'
import { messageOf } from '../lib/errors'

/** SA-01 ログイン。静かな一枚の紙に、水引と Google でログイン */
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
    <SheetPage>
      <p className="admin-sheet-note">{ja.admin.book.loginNote}</p>
      <Button onClick={handleClick} loading={loading} fullWidth>
        {ja.admin.login.google}
      </Button>
      {denied ? (
        <p role="alert" className="admin-sheet-alert">
          {ja.admin.login.denied}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="admin-sheet-alert">
          {messageOf(null)}
        </p>
      ) : null}
    </SheetPage>
  )
}
