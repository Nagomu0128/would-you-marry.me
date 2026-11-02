import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// happy-dom の Web Animations は、アンマウント時に AbortError を投げる。
// Motion は animate がないと JavaScript のアニメーションに切り替わるので、テストでは無効にする
Reflect.deleteProperty(Element.prototype, 'animate')

// Node の実験的な localStorage が happy-dom のものを隠すことがあるので、メモリ上の実装に置き換える
const store = new Map<string, string>()
const memoryStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
  key: (index: number) => [...store.keys()][index] ?? null,
  get length() {
    return store.size
  },
}
Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true })

afterEach(() => {
  cleanup()
})
