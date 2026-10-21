import type { AdminTenant } from '@wym/shared'
import { ja } from '@wym/ui'
import { Link } from 'react-router'
import {
  AdminEmpty,
  LinkButton,
  LoadError,
  LoadingBlocks,
  PeriodTag,
  Screen,
} from '../components/shell'
import { api } from '../lib/api'
import { eventDateParts, formatCount, periodLabel, periodLabelKey } from '../lib/format'
import { useAsync } from '../lib/use-async'

/** SA-02 テナント一覧。式ごとに帳面の一行（開催日・テナント名・期間の札・参加者と写真の数） */
export function TenantList() {
  const { state, retry } = useAsync(() => api.listTenants(), 'tenants')

  return (
    <Screen
      title={ja.admin.tenants.heading}
      actions={
        <LinkButton href="/tenants/new" variant="primary">
          {ja.admin.tenants.create}
        </LinkButton>
      }
    >
      {state.status === 'loading' ? <LoadingBlocks /> : null}
      {state.status === 'error' ? <LoadError error={state.error} onRetry={retry} /> : null}
      {state.status === 'ready' ? (
        state.data.tenants.length === 0 ? (
          <AdminEmpty message={ja.admin.tenants.empty} />
        ) : (
          <ol className="admin-entries">
            {state.data.tenants.map((t) => (
              <TenantEntry key={t.id} tenant={t} />
            ))}
          </ol>
        )
      ) : null}
    </Screen>
  )
}

/** 帳面の一行。行のどこを押しても詳細へ移る（リンクはテナント名だけで、読み上げを短く保つ） */
function TenantEntry({ tenant: t }: { tenant: AdminTenant }) {
  const { year, month, day, weekday } = eventDateParts(t.eventDate)
  const period = periodLabelKey(t)
  return (
    <li className="admin-entry" data-period={period}>
      <time dateTime={t.eventDate} className="admin-entry-date">
        <span className="admin-entry-month">
          {year}.{month}
        </span>
        <span className="admin-entry-day">{day}</span>
        <span className="admin-entry-weekday">{weekday}</span>
      </time>
      <div className="admin-entry-main">
        <h2 className="admin-entry-name">
          <Link to={`/tenants/${t.id}`} className="admin-entry-link">
            {t.name}
          </Link>
        </h2>
        <PeriodTag period={period}>{periodLabel(t)}</PeriodTag>
      </div>
      <p className="admin-entry-stats">
        {ja.admin.tenants.stats({
          guests: formatCount(t.stats.guestCount),
          photos: formatCount(t.stats.photoCount),
        })}
      </p>
      <span className="admin-entry-mark" aria-hidden="true" />
    </li>
  )
}
