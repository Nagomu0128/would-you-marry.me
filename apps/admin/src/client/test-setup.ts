import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// happy-dom の Web Animations は、アンマウント時に AbortError を投げる。Motion の JS アニメーションに切り替える
Reflect.deleteProperty(Element.prototype, 'animate')

afterEach(() => {
  cleanup()
})
