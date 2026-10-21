import { Brand, cn, ErrorState, type LinkComponent, Skeleton } from '@wym/ui'
import { type ReactNode, useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import type { ApiClientError } from '../lib/api'
import { messageOf } from '../lib/errors'

/** packages/ui のリンク部品に渡す React Router のリンク */
export const RouterLink: LinkComponent = ({ href, children, ...rest }) => (
  <Link to={href} {...rest}>
    {children}
  </Link>
)

/** 管理面の画面の外枠（幅 960px、スマートフォンでは 16px の余白） */
export function Screen({
  title,
  backHref,
  actions,
  children,
}: {
  title: string
  backHref?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const { pathname } = useLocation()
  useEffect(() => {
    document.title = `${title || '管理'} | The Wedding Journal`
  }, [title])
  return (
    <div className="admin-shell">
      <a href="#admin-main" className="skip-link">
        本文へ移動
      </a>
      <aside className="admin-rail">
        <div className="admin-rail-top">
          <Brand caption="The host's notebook" />
          <span className="eyebrow text-accent">管理</span>
        </div>
        <nav className="admin-nav" aria-label="管理メニュー">
          <Link to="/" aria-current={pathname !== '/monitor' ? 'page' : undefined}>
            01 <span>結婚式の管理</span>
          </Link>
          <Link to="/monitor" aria-current={pathname === '/monitor' ? 'page' : undefined}>
            02 <span>利用状況</span>
          </Link>
        </nav>
        <p className="admin-rail-note" lang="en">
          Behind every
          <br />
          beautiful day.
        </p>
      </aside>
      <div className="admin-content">
        <header className="admin-header">
          {backHref ? (
            <Link to={backHref} className="header-back">
              ← 戻る
            </Link>
          ) : (
            <p className="eyebrow text-muted" lang="en">
              The host's notebook
            </p>
          )}
          <div className="admin-header-row">
            <h1>{title}</h1>
            {actions}
          </div>
        </header>
        <main id="admin-main" tabIndex={-1} className="admin-main">
          {children}
        </main>
      </div>
    </div>
  )
}

/** ボタンの見た目のリンク（高さ 48px） */
export function LinkButton({
  href,
  external = false,
  variant = 'secondary',
  children,
  className,
}: {
  href: string
  external?: boolean
  variant?: 'primary' | 'secondary'
  children: ReactNode
  className?: string
}) {
  const cls = cn('ui-button', className)
  if (external) {
    return (
      <a
        data-variant={variant}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
      >
        {children}
      </a>
    )
  }
  return (
    <Link data-variant={variant} to={href} className={cls}>
      {children}
    </Link>
  )
}

export function LoadingBlocks() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

export function LoadError({ error, onRetry }: { error: ApiClientError; onRetry: () => void }) {
  return <ErrorState message={messageOf(error)} onRetry={onRetry} />
}

/** 一覧のラベル（準備中 など） */
export function Badge({
  children,
  tone = 'normal',
}: {
  children: ReactNode
  tone?: 'normal' | 'warn'
}) {
  return (
    <span className="badge" data-tone={tone}>
      {children}
    </span>
  )
}
