// 構造化ログ（JSON 1 行）。メールアドレスなどの個人情報は渡さない

type Level = 'info' | 'warn' | 'error'

export type LogFields = {
  tenantId?: string
  [key: string]: string | number | boolean | null | undefined
}

export function log(level: Level, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({ level, event, ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}
