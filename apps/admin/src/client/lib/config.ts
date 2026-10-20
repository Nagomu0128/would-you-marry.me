/** Cloudflare のダッシュボード（`VITE_MONITORING_URL` が未設定のとき） */
export const DEFAULT_MONITORING_URL = 'https://dash.cloudflare.com/'

/** 外部の監視ツールの URL（ビルド時の `VITE_MONITORING_URL`） */
export function monitoringUrl(env: string | undefined = import.meta.env.VITE_MONITORING_URL) {
  return env && env.trim() !== '' ? env : DEFAULT_MONITORING_URL
}
