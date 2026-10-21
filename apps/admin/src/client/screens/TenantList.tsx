import { ArrowUpRightIcon, Button, EmptyState, ja } from '@wym/ui'
import { Link, useNavigate } from 'react-router'
import { Badge, LinkButton, LoadError, LoadingBlocks, Screen } from '../components/shell'
import { api } from '../lib/api'
import { signOut } from '../lib/auth'
import { formatCount, periodLabel } from '../lib/format'
import { useAsync } from '../lib/use-async'

/** SA-02 テナント一覧 */
export function TenantList() {
  const navigate = useNavigate()
  const { state, retry } = useAsync(() => api.listTenants(), 'tenants')

  return (
    <Screen
      title={ja.admin.tenants.heading}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="text"
            onClick={() => signOut().then(() => navigate('/login', { replace: true }))}
          >
            {ja.admin.logout}
          </Button>
          <LinkButton href="/tenants/new" variant="primary" className="px-4">
            {ja.admin.tenants.create}
          </LinkButton>
        </div>
      }
    >
      <p className="text-sub text-muted">一日を迎える準備から、思い出のお届けまで。</p>
      {state.status === 'loading' ? <LoadingBlocks /> : null}
      {state.status === 'error' ? <LoadError error={state.error} onRetry={retry} /> : null}
      {state.status === 'ready' ? (
        state.data.tenants.length === 0 ? (
          <EmptyState message={ja.admin.tenants.empty} />
        ) : (
          <>
            <dl className="admin-overview">
              <div className="admin-stat">
                <dt>結婚式</dt>
                <dd>{formatCount(state.data.tenants.length)}</dd>
              </div>
              <div className="admin-stat">
                <dt>参加者</dt>
                <dd>
                  {formatCount(state.data.tenants.reduce((n, t) => n + t.stats.guestCount, 0))}
                </dd>
              </div>
              <div className="admin-stat">
                <dt>思い出の写真</dt>
                <dd>
                  {formatCount(state.data.tenants.reduce((n, t) => n + t.stats.photoCount, 0))}
                </dd>
              </div>
            </dl>
            <ul className="tenant-list">
              {state.data.tenants.map((t) => (
                <li key={t.id}>
                  <Link to={`/tenants/${t.id}`} className="tenant-entry">
                    <div className="tenant-date" aria-hidden="true">
                      <span>{t.eventDate.slice(8)}</span>
                      <small>{t.eventDate.slice(0, 7).replace('-', ' / ')}</small>
                    </div>
                    <div>
                      <h2>{t.name}</h2>
                      <div className="tenant-meta">
                        <time dateTime={t.eventDate}>{t.eventDate}</time>
                        <Badge tone={t.suspended ? 'warn' : 'normal'}>{periodLabel(t)}</Badge>
                      </div>
                      <p className="mt-2 text-caption text-muted">
                        {ja.admin.tenants.stats({
                          guests: formatCount(t.stats.guestCount),
                          photos: formatCount(t.stats.photoCount),
                        })}
                      </p>
                    </div>
                    <ArrowUpRightIcon size={18} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
      <div>
        <LinkButton href="/monitor">{ja.admin.tenants.monitor}</LinkButton>
      </div>
    </Screen>
  )
}
