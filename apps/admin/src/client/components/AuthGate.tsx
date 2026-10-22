import type { AdminMeResponse } from '@wym/shared'
import { Button, ja, Skeleton } from '@wym/ui'
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router'
import { ApiClientError, api, setUnauthenticatedHandler } from '../lib/api'
import { signOut } from '../lib/auth'
import { LoadError, SheetPage } from './shell'

type Gate =
  | { status: 'loading' }
  | { status: 'ok'; me: AdminMeResponse }
  | { status: 'unauthenticated' }
  | { status: 'forbidden' }
  | { status: 'error'; error: ApiClientError }

/**
 * 未ログインはログインへ、許可されていないアカウントは拒否の表示とログアウト。
 * ログイン中の管理者は `Outlet` の context で外枠（背表紙）に渡す。
 */
export function AuthGate() {
  const navigate = useNavigate()
  const [gate, setGate] = useState<Gate>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt は再試行のきっかけ
  useEffect(() => {
    let cancelled = false
    api.me().then(
      (me) => !cancelled && setGate({ status: 'ok', me }),
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
        <SheetPage>
          <div className="admin-sheet-wait" aria-busy="true">
            <span className="sr-only-text">{ja.admin.book.loading}</span>
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-13 w-full" />
          </div>
        </SheetPage>
      )
    case 'unauthenticated':
      return <Navigate to="/login" replace />
    case 'forbidden':
      return <Denied onLogout={() => signOut().then(() => navigate('/login', { replace: true }))} />
    case 'error':
      return (
        <SheetPage>
          <LoadError
            error={gate.error}
            onRetry={() => {
              setGate({ status: 'loading' })
              setAttempt((n) => n + 1)
            }}
          />
        </SheetPage>
      )
    case 'ok':
      return <Outlet context={gate.me} />
  }
}

function Denied({ onLogout }: { onLogout: () => void }) {
  return (
    <SheetPage>
      <p role="alert" className="admin-sheet-alert">
        {ja.admin.login.denied}
      </p>
      <Button variant="secondary" fullWidth onClick={onLogout}>
        {ja.admin.logout}
      </Button>
    </SheetPage>
  )
}
