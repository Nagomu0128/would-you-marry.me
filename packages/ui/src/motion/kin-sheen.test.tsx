import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KIN_SHEEN_OFFSCREEN_ATTR, watchKinSheen } from './kin-sheen'
import { MotionProvider } from './provider'

// IntersectionObserver の代わり。見張っている要素と、見え方を知らせる関数を持つ
const observed = new Set<Element>()
let created = 0
let notify: (target: Element, isIntersecting: boolean) => void = () => {}

class FakeObserver {
  constructor(callback: (entries: { target: Element; isIntersecting: boolean }[]) => void) {
    created += 1
    notify = (target, isIntersecting) => callback([{ target, isIntersecting }])
  }
  observe(el: Element) {
    observed.add(el)
  }
  unobserve(el: Element) {
    observed.delete(el)
  }
  disconnect() {
    observed.clear()
  }
  takeRecords() {
    return []
  }
}

beforeEach(() => {
  observed.clear()
  created = 0
  vi.stubGlobal('IntersectionObserver', FakeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function sheen(text: string) {
  const el = document.createElement('p')
  el.className = 'wa-kin-sheen'
  el.textContent = text
  return el
}

describe('watchKinSheen（金のきらめきを画面の外で止める）', () => {
  it('はじめからある要素を見張り、画面の外にある間だけ印を付ける', () => {
    const el = sheen('日付')
    document.body.append(el)
    const stop = watchKinSheen()
    expect(observed.has(el)).toBe(true)

    notify(el, false)
    expect(el).toHaveAttribute(KIN_SHEEN_OFFSCREEN_ATTR)
    notify(el, true)
    expect(el).not.toHaveAttribute(KIN_SHEEN_OFFSCREEN_ATTR)
    stop()
  })

  it('後から追加された要素・クラスを付けた要素も見張り、取り除かれたら見張りをやめる', async () => {
    const stop = watchKinSheen()
    const wrapper = document.createElement('div')
    const inner = sheen('水引')
    wrapper.append(inner)
    document.body.append(wrapper)
    await waitFor(() => expect(observed.has(inner)).toBe(true))

    const plain = document.createElement('span')
    document.body.append(plain)
    plain.classList.add('wa-kin-sheen')
    await waitFor(() => expect(observed.has(plain)).toBe(true))

    notify(plain, false)
    plain.classList.remove('wa-kin-sheen')
    await waitFor(() => expect(observed.has(plain)).toBe(false))
    expect(plain).not.toHaveAttribute(KIN_SHEEN_OFFSCREEN_ATTR)

    wrapper.remove()
    await waitFor(() => expect(observed.has(inner)).toBe(false))
    stop()
  })

  it('やめると印を外し、何も見張らない', () => {
    const el = sheen('金')
    document.body.append(el)
    const stop = watchKinSheen()
    notify(el, false)
    stop()
    expect(el).not.toHaveAttribute(KIN_SHEEN_OFFSCREEN_ATTR)
    expect(observed.size).toBe(0)
  })

  it('きらめきの要素がない間は IntersectionObserver を作らない', () => {
    document.body.append(document.createElement('div'))
    const stop = watchKinSheen()
    expect(created).toBe(0)
    stop()
  })

  it('IntersectionObserver がない環境では何もしない', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const el = sheen('金')
    document.body.append(el)
    const stop = watchKinSheen()
    expect(observed.size).toBe(0)
    stop()
  })

  it('MotionProvider が見張りを始め、外すとやめる', () => {
    const { unmount, container } = render(
      <MotionProvider>
        <p className="wa-kin-sheen">寿</p>
      </MotionProvider>,
    )
    const el = container.querySelector('.wa-kin-sheen')
    expect(el && observed.has(el)).toBe(true)
    unmount()
    expect(observed.size).toBe(0)
  })
})
