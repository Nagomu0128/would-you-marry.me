import * as Sentry from '@sentry/react'

/** URL からクエリとフラグメントを取り除く */
export function stripQuery(url: string): string {
  return url.replace(/[?#].*$/, '')
}

type WithUrl = { url?: string; request?: { url?: string } }

/** ビルド時の VITE_SENTRY_DSN があるときだけ初期化する。個人情報は送らない */
export function initSentry(dsn: string | undefined = import.meta.env.VITE_SENTRY_DSN): void {
  if (!dsn) return
  Sentry.init({
    dsn,
    // @sentry/react 11 では sendDefaultPii の代わりに dataCollection で個人情報を止める
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    beforeSend(event) {
      if (event.request?.url) event.request.url = stripQuery(event.request.url)
      if (event.request) delete event.request.query_string
      return event
    },
    beforeBreadcrumb(breadcrumb) {
      const data = breadcrumb.data as (WithUrl & Record<string, unknown>) | undefined
      if (data) {
        for (const field of ['url', 'from', 'to'] as const) {
          const value = data[field]
          if (typeof value === 'string') data[field] = stripQuery(value)
        }
      }
      return breadcrumb
    },
  })
}
