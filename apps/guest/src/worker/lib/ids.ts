const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** テナント ID（UUID）の形か。Cookie の名前に使う前に必ず確認する */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}
