import { Button, EmptyState, ja, ListCard } from '@wym/ui'
import { useNavigate } from 'react-router'
import {
  Badge,
  LinkButton,
  LoadError,
  LoadingBlocks,
  RouterLink,
  Screen,
} from '../components/shell'
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
      {state.status === 'loading' ? <LoadingBlocks /> : null}
      {state.status === 'error' ? <LoadError error={state.error} onRetry={retry} /> : null}
      {state.status === 'ready' ? (
        state.data.tenants.length === 0 ? (
          <EmptyState message={ja.admin.tenants.empty} />
        ) : (
          <ul className="flex flex-col gap-3">
            {state.data.tenants.map((t) => (
              <li key={t.id}>
                <ListCard title={t.name} href={`/tenants/${t.id}`} LinkComponent={RouterLink}>
                  <span className="flex items-center gap-2">
                    <span>{t.eventDate}</span>
                    <Badge tone={t.suspended ? 'warn' : 'normal'}>{periodLabel(t)}</Badge>
                  </span>
                  <span className="block">
                    {ja.admin.tenants.stats({
                      guests: formatCount(t.stats.guestCount),
                      photos: formatCount(t.stats.photoCount),
                    })}
                  </span>
                </ListCard>
              </li>
            ))}
          </ul>
        )
      ) : null}
      <div>
        <LinkButton href="/monitor">{ja.admin.tenants.monitor}</LinkButton>
      </div>
    </Screen>
  )
}
