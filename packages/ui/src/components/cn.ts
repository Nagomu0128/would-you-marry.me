/** クラス名をつなぐ。falsy な値は無視する */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
