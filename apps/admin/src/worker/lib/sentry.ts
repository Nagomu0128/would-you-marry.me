// Sentry に送るイベントから個人情報を取り除く（ADR 0001: Sentry に個人情報を送らない）。
// DB のエラーの message には SQL のパラメーター（トークン・セッション ID のハッシュ・ニックネームなど）が
// 入りうるので、例外は「種類」だけを残して message を捨てる。
import type { ErrorEvent } from '@sentry/cloudflare'

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  for (const exception of event.exception?.values ?? []) {
    exception.value = exception.type ?? 'Error'
  }
  event.message = undefined
  event.extra = undefined
  event.user = undefined
  // コンソールの出力・SQL を含みうる breadcrumb は送らない
  event.breadcrumbs = undefined
  if (event.request) {
    // クエリ文字列（参加トークンなど）、Cookie、ヘッダー、本文は送らない
    if (event.request.url) event.request.url = event.request.url.split('?')[0]
    event.request.cookies = undefined
    event.request.query_string = undefined
    event.request.headers = undefined
    event.request.data = undefined
  }
  return event
}
