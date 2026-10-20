// ウェルカム演出を再生済みかどうか。テナントごとに localStorage に保存する。
// localStorage が使えない（アプリ内ブラウザ、プライベートモードなど）ときは、
// このページを開いている間だけ覚える（読み書きはすべて try/catch）。

// 新郎新婦用ページのお祝いの演出も同じ仕組みで、別のキーに保存する。
const memory = new Set<string>()

const welcomeKey = (tenantId: string) => `wym:welcome-played:${tenantId}`
const celebrationKey = (tenantId: string) => `wym:couple-celebration-played:${tenantId}`

function hasPlayed(memoryKey: string, storageKey: string): boolean {
  if (memory.has(memoryKey)) return true
  try {
    return window.localStorage.getItem(storageKey) === '1'
  } catch {
    return false
  }
}

function markPlayed(memoryKey: string, storageKey: string): void {
  memory.add(memoryKey)
  try {
    window.localStorage.setItem(storageKey, '1')
  } catch {
    // 保存できなくても、演出は表示し終わっているので何もしない
  }
}

export function hasPlayedWelcome(tenantId: string): boolean {
  return hasPlayed(welcomeKey(tenantId), welcomeKey(tenantId))
}

export function markWelcomePlayed(tenantId: string): void {
  markPlayed(welcomeKey(tenantId), welcomeKey(tenantId))
}

export function hasPlayedCelebration(tenantId: string): boolean {
  return hasPlayed(celebrationKey(tenantId), celebrationKey(tenantId))
}

export function markCelebrationPlayed(tenantId: string): void {
  markPlayed(celebrationKey(tenantId), celebrationKey(tenantId))
}

/** テスト用 */
export function resetWelcomeMemory(): void {
  memory.clear()
}
