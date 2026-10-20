import { act, fireEvent, render, screen } from '@testing-library/react'
import { domAnimation, LazyMotion } from 'motion/react'
import type { ReactElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CoupleCelebration } from './CoupleCelebration'
import { LikeBurst } from './LikeBurst'
import { RankingReveal } from './RankingReveal'
import { UploadComplete } from './UploadComplete'
import { WelcomeAnimation } from './WelcomeAnimation'

const reducedMotion = vi.hoisted(() => ({ value: false }))

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => reducedMotion.value }
})

const wrap = (ui: ReactElement) => <LazyMotion features={domAnimation}>{ui}</LazyMotion>

// happy-dom の Web Animations は破棄時に AbortError を投げるため、Motion に JS アニメーションを使わせる
beforeAll(() => {
  Reflect.deleteProperty(Element.prototype, 'animate')
})

beforeEach(() => {
  reducedMotion.value = false
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const fullscreen: [string, (onComplete: () => void) => ReactElement][] = [
  [
    'WelcomeAnimation',
    (c) => <WelcomeAnimation tenantName="太郎 & 花子" onComplete={c} skipLabel="スキップ" />,
  ],
  ['UploadComplete', (c) => <UploadComplete onComplete={c} skipLabel="スキップ" />],
  [
    'CoupleCelebration',
    (c) => <CoupleCelebration tenantName="太郎 & 花子" onComplete={c} skipLabel="スキップ" />,
  ],
]

describe.each(fullscreen)('%s（全画面の演出）', (_name, make) => {
  it('表示され、3 秒以内に onComplete が一度だけ呼ばれる', () => {
    const onComplete = vi.fn()
    render(wrap(make(onComplete)))
    expect(screen.getByTestId('motion-stage')).toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('motion-stage')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('タップで飛ばせて、二重に onComplete を呼ばない', () => {
    const onComplete = vi.fn()
    render(wrap(make(onComplete)))
    fireEvent.click(screen.getByRole('button', { name: 'スキップ' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('motion-stage')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('動きを減らす設定では何も表示せず、すぐ onComplete を呼ぶ', () => {
    reducedMotion.value = true
    const onComplete = vi.fn()
    const { container } = render(wrap(make(onComplete)))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(container).toBeEmptyDOMElement()
  })

  it('アンマウントするとタイマーを片付ける', () => {
    const onComplete = vi.fn()
    const { unmount } = render(wrap(make(onComplete)))
    unmount()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('WelcomeAnimation / CoupleCelebration', () => {
  it('テナント名を表示する', () => {
    render(wrap(<WelcomeAnimation tenantName="太郎 & 花子" onComplete={() => {}} />))
    expect(screen.getByText('太郎 & 花子')).toBeInTheDocument()
  })

  it('お祝いにもテナント名を表示する', () => {
    render(wrap(<CoupleCelebration tenantName="太郎 & 花子" onComplete={() => {}} />))
    expect(screen.getByText('太郎 & 花子')).toBeInTheDocument()
  })
})

describe('LikeBurst', () => {
  it('active になると表示され、onComplete が一度だけ呼ばれる', () => {
    const onComplete = vi.fn()
    render(wrap(<LikeBurst active onComplete={onComplete} />))
    expect(screen.getByTestId('like-burst')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('active でなければ何も表示せず、取り消しでは弾まない', () => {
    const onComplete = vi.fn()
    const { rerender } = render(wrap(<LikeBurst active onComplete={onComplete} />))
    rerender(wrap(<LikeBurst active={false} onComplete={onComplete} />))
    expect(screen.queryByTestId('like-burst')).toBeNull()
  })

  it('もう一度 active になると再生し直す', () => {
    const onComplete = vi.fn()
    const { rerender } = render(wrap(<LikeBurst active onComplete={onComplete} />))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    rerender(wrap(<LikeBurst active={false} onComplete={onComplete} />))
    rerender(wrap(<LikeBurst active onComplete={onComplete} />))
    expect(screen.getByTestId('like-burst')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onComplete).toHaveBeenCalledTimes(2)
  })

  it('動きを減らす設定では何も表示せず、すぐ onComplete を呼ぶ', () => {
    reducedMotion.value = true
    const onComplete = vi.fn()
    const { container } = render(wrap(<LikeBurst active onComplete={onComplete} />))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(container).toBeEmptyDOMElement()
  })

  it('アンマウントするとタイマーを片付ける', () => {
    const onComplete = vi.fn()
    const { unmount } = render(wrap(<LikeBurst active onComplete={onComplete} />))
    unmount()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('RankingReveal', () => {
  const items = ['一位', '二位', '三位', '四位', '五位'].map((t) => <p key={t}>{t}</p>)

  it('items をすべて順位の順に描画し、1 位に王冠が載る', () => {
    render(wrap(<RankingReveal items={items} />))
    const rows = screen.getAllByTestId('ranking-item')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveTextContent('一位')
    expect(rows[4]).toHaveTextContent('五位')
    expect(screen.getAllByTestId('crown')).toHaveLength(1)
    expect(rows[0]).toContainElement(screen.getByTestId('crown'))
  })

  it('onComplete が 3 秒以内に一度だけ呼ばれる', () => {
    const onComplete = vi.fn()
    render(wrap(<RankingReveal items={items} onComplete={onComplete} />))
    expect(onComplete).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('3 件未満でも描画できる', () => {
    render(wrap(<RankingReveal items={[<p key="a">一位</p>]} />))
    expect(screen.getAllByTestId('ranking-item')).toHaveLength(1)
  })

  it('動きを減らす設定では内容をすぐ表示し、すぐ onComplete を呼ぶ', () => {
    reducedMotion.value = true
    const onComplete = vi.fn()
    render(wrap(<RankingReveal items={items} onComplete={onComplete} />))
    expect(screen.getAllByTestId('ranking-item')).toHaveLength(5)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('アンマウントするとタイマーを片付ける', () => {
    const onComplete = vi.fn()
    const { unmount } = render(wrap(<RankingReveal items={items} onComplete={onComplete} />))
    unmount()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(onComplete).not.toHaveBeenCalled()
  })
})
