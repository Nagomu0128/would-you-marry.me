// ウェルカム演出を再生済みかどうか。テナントごとに localStorage に保存する。
// localStorage が使えない（アプリ内ブラウザ、プライベートモードなど）ときは、
// このページを開いている間だけ覚える（読み書きはすべて try/catch）。

const memory = new Set<string>()

const key = (tenantId: string) => `wym:welcome-played:${tenantId}`

export function hasPlayedWelcome(tenantId: string): boolean {
  if (memory.has(tenantId)) return true
  try {
    return window.localStorage.getItem(key(tenantId)) === '1'
  } catch {
    return false
  }
}

export function markWelcomePlayed(tenantId: string): void {
  memory.add(tenantId)
  try {
    window.localStorage.setItem(key(tenantId), '1')
  } catch {
    // 保存できなくても、演出は表示し終わっているので何もしない
  }
}

/** テスト用 */
export function resetWelcomeMemory(): void {
  memory.clear()
}
