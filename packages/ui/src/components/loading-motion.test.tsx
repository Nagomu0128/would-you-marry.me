import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ja } from '../messages/ja'
import { MotionProvider } from '../motion'
import { PageLoading, PageTransition, PULL_TRIGGER, PullIndicator, Skeleton } from '.'

// 画面の切り替え・読み込み・引っぱって更新（担当: micro）

function wrap(ui: ReactNode) {
  return render(<MotionProvider>{ui}</MotionProvider>)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PageTransition', () => {
  it('中身を表示する', () => {
    wrap(
      <PageTransition className="page">
        <p>画面</p>
      </PageTransition>,
    )
    expect(screen.getByText('画面')).toBeInTheDocument()
    expect(screen.getByText('画面').parentElement).toHaveClass('page')
  })

  it('中の position: fixed の演出を切り抜かない（clip-path を使わない）', () => {
    wrap(
      <PageTransition>
        <p>画面</p>
      </PageTransition>,
    )
    expect(screen.getByText('画面').parentElement?.style.clipPath ?? '').toBe('')
  })
})

describe('PageLoading', () => {
  it('読み上げ用に「読み込み中」を持ち、水引の線は読み上げない', () => {
    const { container } = render(<PageLoading className="layout-admin" />)
    const root = container.firstElementChild
    expect(root).toHaveAttribute('aria-busy', 'true')
    expect(root).toHaveClass('wa-loading', 'layout-admin')
    expect(screen.getByText(ja.common.loading)).toHaveClass('sr-only-text')
    const knot = container.querySelector('svg')
    expect(knot).toHaveAttribute('aria-hidden', 'true')
    expect(knot).toHaveClass('wa-knot', 'wa-loading-knot')
  })

  it('旧デザインの英字の見出しを出さない', () => {
    render(<PageLoading />)
    expect(screen.queryByText('The Wedding Journal')).toBeNull()
  })
})

describe('Skeleton', () => {
  it('読み上げの対象にせず、渡した大きさ・形のクラスを持つ', () => {
    render(<Skeleton className="h-4 w-1/2" />)
    const el = screen.getByTestId('skeleton')
    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el).toHaveClass('wa-skeleton', 'h-4', 'w-1/2')
  })
})

describe('PullIndicator', () => {
  const chip = () => screen.getByTestId('pull-indicator').querySelector('.wa-pull') as HTMLElement
  const mover = () => chip().parentElement as HTMLElement

  it('引いていないときは見えず、読み上げない', () => {
    render(<PullIndicator distance={0} refreshing={false} />)
    expect(screen.getByTestId('pull-indicator')).toHaveAttribute('aria-hidden', 'true')
    expect(mover().style.opacity).toBe('0')
    expect(chip().style.getPropertyValue('--wa-knot-draw')).toBe('1')
  })

  it('引くほど水引が描かれ、しきい値を越えると結ばれる', () => {
    const { rerender } = render(<PullIndicator distance={PULL_TRIGGER / 2} refreshing={false} />)
    expect(chip()).toHaveAttribute('data-state', 'pulling')
    expect(Number(chip().style.getPropertyValue('--wa-knot-draw'))).toBeCloseTo(0.5)
    expect(mover().style.transform).toBe(`translateY(${PULL_TRIGGER / 4}px)`)

    rerender(<PullIndicator distance={PULL_TRIGGER} refreshing={false} />)
    expect(chip()).toHaveAttribute('data-state', 'tied')
    expect(Number(chip().style.getPropertyValue('--wa-knot-draw'))).toBe(0)
    expect(mover().style.opacity).toBe('1')
  })

  it('更新中は結んだ姿で、ヘッダーの下に留まる', () => {
    render(<PullIndicator distance={0} refreshing />)
    expect(chip()).toHaveAttribute('data-state', 'refreshing')
    expect(mover().style.opacity).toBe('1')
    expect(mover().style.transform).toBe(`translateY(${PULL_TRIGGER / 2}px)`)
  })

  it('動きを減らす設定では位置を動かさない', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
    }))
    render(<PullIndicator distance={PULL_TRIGGER} refreshing={false} />)
    expect(mover().style.transform).toBe('translateY(0px)')
    expect(chip()).toHaveAttribute('data-state', 'tied')
  })
})
