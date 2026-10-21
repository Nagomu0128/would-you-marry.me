import { ja } from '@wym/ui'
import { Link } from 'react-router'
import { LinkButton, LoadError, LoadingBlocks, Screen } from '../components/shell'
import { api } from '../lib/api'
import { monitoringUrl } from '../lib/config'
import { formatBytes, formatCount } from '../lib/format'
import { useAsync } from '../lib/use-async'

/** SA-06 監視 */
export function Monitor() {
  const { state, retry } = useAsync(() => api.listTenants(), 'monitor')
  const m = ja.admin.monitor

  return (
    <Screen title={m.heading} backHref="/">
      {state.status === 'loading' ? <LoadingBlocks /> : null}
      {state.status === 'error' ? <LoadError error={state.error} onRetry={retry} /> : null}
      {state.status === 'ready' ? (
        // 横スクロールさせないよう、列の幅を固定して名前を折り返す
        <table className="monitor-table">
          <caption className="sr-only">結婚式ごとの利用状況</caption>
          <thead>
            <tr className="border-b border-rule text-left text-caption text-muted">
              <th scope="col" className="w-[34%] py-2 pr-1 font-normal">
                {m.tenant}
              </th>
              <th scope="col" className="py-2 pr-1 text-right font-normal">
                {m.guests}
              </th>
              <th scope="col" className="py-2 pr-1 text-right font-normal">
                {m.photos}
              </th>
              <th scope="col" className="py-2 pr-1 text-right font-normal">
                {m.likes}
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                {m.storage}
              </th>
            </tr>
          </thead>
          <tbody>
            {state.data.tenants.map((t) => (
              <tr key={t.id} className="border-b border-rule align-top">
                <th scope="row" className="py-2 pr-1 text-left font-normal break-words">
                  <Link to={`/tenants/${t.id}`} className="text-accent underline">
                    {t.name}
                  </Link>
                </th>
                <td className="py-2 pr-1 text-right">{formatCount(t.stats.guestCount)}</td>
                <td className="py-2 pr-1 text-right">{formatCount(t.stats.photoCount)}</td>
                <td className="py-2 pr-1 text-right">{formatCount(t.stats.likeCount)}</td>
                <td className="py-2 text-right">{formatBytes(t.stats.storageBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div>
        <LinkButton href={monitoringUrl()} external>
          {m.openTool}
        </LinkButton>
      </div>
    </Screen>
  )
}
