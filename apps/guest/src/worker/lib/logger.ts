// 構造化ログ（JSON 1 行、Workers Logs で検索する）。
// ニックネーム・トークン・セッション ID・IP アドレスなどの個人情報は出さない。
// 個人情報を出せないように、渡せる項目をここで限定している。

export type LogFields = {
  /** NFR-18: テナント単位で絞り込めるように、できるだけ付ける */
  tenantId?: string
  code?: string
  status?: number
  method?: string
  /** クエリ文字列を含まないパス */
  path?: string
  durationMs?: number
  /** 例外の種類（メッセージは個人情報を含みうるので出さない） */
  errorName?: string
}

export type LogLevel = 'info' | 'warn' | 'error'

export function logEvent(event: string, fields: LogFields = {}, level: LogLevel = 'info'): void {
  const line = JSON.stringify({ level, event, ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}
