import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// happy-dom の Web Animations は、アンマウント時に AbortError を投げる。
// Motion は animate がないと JavaScript のアニメーションに切り替わるので、テストでは無効にする
Reflect.deleteProperty(Element.prototype, 'animate')

afterEach(() => {
  cleanup()
})
