import { ja } from '@wym/ui'
import { useId } from 'react'
import { Link } from 'react-router'
import { AdminEmpty, LinkButton, LoadError, LoadingBlocks, Screen } from '../components/shell'
import { api } from '../lib/api'
import { monitoringUrl } from '../lib/config'
import { formatBytes, formatCount, formatEventDate } from '../lib/format'
import { useAsync } from '../lib/use-async'

/** SA-06 監視。結婚式ごとの利用状況の表。狭い画面では表の中だけを横に送る */
export function Monitor() {
  const { state, retry } = useAsync(() => api.listTenants(), 'monitor')
  const m = ja.admin.monitor
  const captionId = useId()

  return (
    <Screen
      title={m.heading}
      actions={
        <LinkButton href={monitoringUrl()} external>
          {m.openTool}
          <span className="admin-external-mark" aria-hidden="true" />
        </LinkButton>
      }
    >
      {state.status === 'loading' ? <LoadingBlocks /> : null}
      {state.status === 'error' ? <LoadError error={state.error} onRetry={retry} /> : null}
      {state.status === 'ready' && state.data.tenants.length === 0 ? (
        <AdminEmpty message={ja.admin.tenants.empty} />
      ) : null}
      {state.status === 'ready' && state.data.tenants.length > 0 ? (
        // 横に送れる表は、キーボードでも送れるようにフォーカスを受け取る
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region must be keyboard-reachable
        <section className="admin-table-scroll" aria-labelledby={captionId} tabIndex={0}>
          <table className="admin-table">
            <caption id={captionId}>{ja.admin.book.monitorCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{m.tenant}</th>
                <th scope="col">{m.guests}</th>
                <th scope="col">{m.photos}</th>
                <th scope="col">{m.likes}</th>
                <th scope="col">{m.storage}</th>
              </tr>
            </thead>
            <tbody>
              {state.data.tenants.map((t) => (
                <tr key={t.id}>
                  <th scope="row">
                    <Link to={`/tenants/${t.id}`} className="admin-table-name">
                      {t.name}
                    </Link>
                    <time dateTime={t.eventDate} className="admin-table-date">
                      {formatEventDate(t.eventDate)}
                    </time>
                  </th>
                  <td>{formatCount(t.stats.guestCount)}</td>
                  <td>{formatCount(t.stats.photoCount)}</td>
                  <td>{formatCount(t.stats.likeCount)}</td>
                  <td>{formatBytes(t.stats.storageBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </Screen>
  )
}
