import { Button, ja } from '@wym/ui'
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router'
import { ApiClientError, api, setUnauthenticatedHandler } from '../lib/api'
import { signOut } from '../lib/auth'
import { LoadError, LoadingBlocks } from './shell'

type Gate =
  | { status: 'loading' }
  | { status: 'ok' }
  | { status: 'unauthenticated' }
  | { status: 'forbidden' }
  | { status: 'error'; error: ApiClientError }

/** 未ログインはログインへ、許可されていないアカウントは拒否の表示とログアウト */
export function AuthGate() {
  const navigate = useNavigate()
  const [gate, setGate] = useState<Gate>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt は再試行のきっかけ
  useEffect(() => {
    let cancelled = false
    api.me().then(
      () => !cancelled && setGate({ status: 'ok' }),
      (error: unknown) => {
        if (cancelled) return
        if (error instanceof ApiClientError) {
          if (error.code === 'UNAUTHENTICATED') return setGate({ status: 'unauthenticated' })
          if (error.code === 'FORBIDDEN') return setGate({ status: 'forbidden' })
          return setGate({ status: 'error', error })
        }
        setGate({ status: 'error', error: new ApiClientError(0, 'NETWORK', 'network error') })
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  // 画面の操作中にセッションが切れたらログインへ
  useEffect(() => {
    setUnauthenticatedHandler(() => navigate('/login', { replace: true }))
    return () => setUnauthenticatedHandler(null)
  }, [navigate])

  switch (gate.status) {
    case 'loading':
      return (
        <div className="layout-admin px-screen pt-6">
          <LoadingBlocks />
        </div>
      )
    case 'unauthenticated':
      return <Navigate to="/login" replace />
    case 'forbidden':
      return <Denied onLogout={() => signOut().then(() => navigate('/login', { replace: true }))} />
    case 'error':
      return (
        <div className="layout-admin px-screen pt-6">
          <LoadError
            error={gate.error}
            onRetry={() => {
              setGate({ status: 'loading' })
              setAttempt((n) => n + 1)
            }}
          />
        </div>
      )
    case 'ok':
      return <Outlet />
  }
}

function Denied({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="screen-h layout-admin px-screen flex flex-col items-center justify-center gap-6 text-center">
      <p role="alert" className="text-body text-error">
        {ja.admin.login.denied}
      </p>
      <Button variant="secondary" onClick={onLogout}>
        {ja.admin.logout}
      </Button>
    </div>
  )
}
