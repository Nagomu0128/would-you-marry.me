/** UUID v4 を採番する */
export function newId(): string {
  return crypto.randomUUID()
}

/** エラー（と、その cause の連鎖）に UNIQUE 制約違反が含まれるか */
export function isUniqueConstraintError(error: unknown): boolean {
  let current: unknown = error
  // cause を最大 5 段までたどる（Drizzle はドライバーのエラーを DrizzleQueryError で包む）
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (current.message.includes('UNIQUE constraint failed')) return true
    current = current.cause
  }
  return false
}
