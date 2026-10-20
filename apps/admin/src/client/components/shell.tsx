import { cn, ErrorState, type LinkComponent, ScreenHeader, Skeleton } from '@wym/ui'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
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
  return (
    <div className="screen-h">
      <div className="layout-admin">
        <ScreenHeader
          title={title}
          backHref={backHref}
          LinkComponent={RouterLink}
          actions={actions}
        />
        <main className="px-screen flex flex-col gap-4 pt-2 pb-12">{children}</main>
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
  const cls = cn(
    'inline-flex h-control min-w-tap items-center justify-center rounded-control px-6 text-body font-semibold',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne',
    variant === 'primary' ? 'bg-charcoal text-white' : 'border border-charcoal text-charcoal',
    className,
  )
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    )
  }
  return (
    <Link to={href} className={cls}>
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
    <span
      className={cn(
        'inline-block rounded-full border px-2 text-caption',
        tone === 'warn' ? 'border-error text-error' : 'border-deep-gold text-deep-gold',
      )}
    >
      {children}
    </span>
  )
}
