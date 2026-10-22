import type { AdminMeResponse } from '@wym/shared'
import {
  Button,
  cn,
  EmptyState,
  ErrorState,
  ja,
  type LinkComponent,
  MizuhikiKnot,
  Skeleton,
} from '@wym/ui'
import { type ReactNode, Suspense, useEffect, useId } from 'react'
import { Link, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router'
import type { ApiClientError } from '../lib/api'
import { signOut } from '../lib/auth'
import { messageOf } from '../lib/errors'
import { eventDateParts, formatEventDate, type PeriodLabelKey } from '../lib/format'

/** packages/ui のリンク部品に渡す React Router のリンク */
export const RouterLink: LinkComponent = ({ href, children, ...rest }) => (
  <Link to={href} {...rest}>
    {children}
  </Link>
)

/** 小さな水引と「would-you-marry.me 管理」。ログインと背表紙で使う */
export function AdminMark({ className }: { className?: string }) {
  return (
    <span className={cn('admin-mark', className)}>
      <MizuhikiKnot strands="three" className="admin-mark-knot" />
      <span className="admin-mark-name">{ja.admin.loginTitle}</span>
    </span>
  )
}

/**
 * 背表紙のない一枚の紙（ログイン・ログインの確認中・拒否）。
 * 水引と「would-you-marry.me 管理」を上に置き、その下に中身を置く。
 */
export function SheetPage({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.title = ja.admin.loginTitle
  }, [])
  return (
    <div className="admin-desk screen-h">
      <main id="admin-main" tabIndex={-1} className="admin-sheet">
        <MizuhikiKnot strands="five" className="admin-sheet-knot" />
        <h1 className="admin-sheet-title">{ja.admin.loginTitle}</h1>
        <span className="wa-kin-rule admin-sheet-rule" aria-hidden="true">
          <i />
        </span>
        {children}
      </main>
    </div>
  )
}

/**
 * 管理面の外枠（準備帳）。64rem 以上では左に背表紙（ブランド・管理メニュー・ログアウト）、
 * それより狭いと上部に置く。画面の中身は右の頁（`#admin-main`）に入り、遅延読み込みの間も背表紙は残る。
 */
export function AdminLayout() {
  const me = useOutletContext<AdminMeResponse | undefined>()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const onMonitor = pathname === '/monitor'
  const b = ja.admin.book

  return (
    <div className="admin-shell screen-h">
      <a href="#admin-main" className="skip-link">
        {b.skipToMain}
      </a>
      <header className="admin-spine">
        <span className="admin-binding" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <Link to="/" className="admin-spine-brand">
          <AdminMark />
        </Link>
        <nav className="admin-nav" aria-label={b.nav}>
          <ul>
            <li>
              {/* テナントの詳細などの下の画面では、一覧の項目を「この中にいる」として示す */}
              <Link
                to="/"
                aria-current={pathname === '/' ? 'page' : onMonitor ? undefined : 'true'}
              >
                {ja.admin.tenants.heading}
              </Link>
            </li>
            <li>
              <Link to="/monitor" aria-current={onMonitor ? 'page' : undefined}>
                {ja.admin.monitor.heading}
              </Link>
            </li>
          </ul>
        </nav>
        <div className="admin-spine-foot">
          {me?.email ? <p className="admin-account">{me.email}</p> : null}
          <Button
            variant="text"
            className="admin-logout"
            onClick={() => signOut().then(() => navigate('/login', { replace: true }))}
          >
            {ja.admin.logout}
          </Button>
        </div>
      </header>
      <main id="admin-main" tabIndex={-1} className="admin-page">
        <Suspense fallback={<ScreenLoading />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}

/** 頁の見出し（戻る・見出しの上の添え書き・見出し・右の操作）と本文 */
export function Screen({
  title,
  backHref,
  lead,
  actions,
  children,
}: {
  /** 渡さないときは読み込み中として見出しの形だけを出す。空文字なら見出しを出さない（読み込みの失敗） */
  title?: string
  backHref?: string
  /** 見出しの上に置く小さな情報（開催日・期間の札など） */
  lead?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    document.title = title ? `${title} | ${ja.admin.loginTitle}` : ja.admin.loginTitle
  }, [title])
  return (
    <>
      <header className="admin-header">
        {backHref ? (
          <Link to={backHref} className="admin-back">
            {ja.common.back}
          </Link>
        ) : null}
        {lead ? <div className="admin-lead">{lead}</div> : null}
        <div className="admin-title-row">
          {title ? <h1 className="admin-title">{title}</h1> : null}
          {title === undefined ? <Skeleton className="admin-title-skeleton" /> : null}
          {actions ? <div className="admin-title-actions">{actions}</div> : null}
        </div>
      </header>
      <div className="admin-body">{children}</div>
    </>
  )
}

/**
 * 帳面の一段。罫で区切り、広い画面では見出しを左の欄に置く。
 * `tone="danger"` は取り消せない操作の段（紅の罫）。
 */
export function Ledger({
  title,
  action,
  tone,
  className,
  children,
}: {
  title: string
  action?: ReactNode
  tone?: 'danger'
  className?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section className={cn('admin-ledger', className)} aria-labelledby={id} data-tone={tone}>
      <div className="admin-ledger-head">
        <h2 id={id}>{title}</h2>
        {action}
      </div>
      <div className="admin-ledger-body">{children}</div>
    </section>
  )
}

/** ボタンの見た目のリンク */
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

/** 読み込み中。帳面の行の形をした薄い罫 */
export function LoadingBlocks({ rows = 4 }: { rows?: number }) {
  return (
    <div className="admin-skeleton" aria-busy="true">
      <span className="sr-only-text">{ja.admin.book.loading}</span>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 並びの変わらない飾りの行
        <div key={i} className="admin-skeleton-row">
          <Skeleton className="admin-skeleton-date" />
          <div className="admin-skeleton-lines">
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** ルートの遅延読み込み中（背表紙は出したまま、頁だけを待つ） */
export function ScreenLoading() {
  return (
    <div className="admin-screen-loading">
      <Skeleton className="admin-title-skeleton" />
      <LoadingBlocks rows={3} />
    </div>
  )
}

export function LoadError({ error, onRetry }: { error: ApiClientError; onRetry: () => void }) {
  return <ErrorState className="admin-state" message={messageOf(error)} onRetry={onRetry} />
}

/** 0 件の表示。罫だけの、まだ何も書かれていない頁 */
export function AdminEmpty({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <EmptyState
      className="admin-state admin-empty"
      message={message}
      action={action}
      icon={<MizuhikiKnot strands="one" tone="kin" className="admin-empty-knot" />}
    />
  )
}

/** 期間の札（準備中・参加受付中 など）。停止中を優先する。色だけでなく文言で区別する */
export function PeriodTag({ period, children }: { period: PeriodLabelKey; children: ReactNode }) {
  return (
    <span className="admin-tag" data-period={period}>
      {children}
    </span>
  )
}

/** 開催日の一行（2026.10.31（土））。見出しの上の添え書きに使う */
export function EventDateLine({ eventDate }: { eventDate: string }) {
  const { weekday } = eventDateParts(eventDate)
  return (
    <time dateTime={eventDate} className="admin-date-line">
      {formatEventDate(eventDate)}
      {weekday ? <span className="admin-date-weekday">{weekday}</span> : null}
    </time>
  )
}
