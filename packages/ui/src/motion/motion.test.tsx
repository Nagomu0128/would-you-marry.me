import { act, fireEvent, render, screen } from '@testing-library/react'
import { domAnimation, LazyMotion } from 'motion/react'
import type { ReactElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ja } from '../messages/ja'
import { CoupleCelebration } from './CoupleCelebration'
import {
  COUPLE_CELEBRATION_DURATION,
  UPLOAD_COMPLETE_DURATION,
  WELCOME_DURATION,
} from './durations'
import { LikeBurst } from './LikeBurst'
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

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

const fullscreen: [string, number, (onComplete: () => void) => ReactElement][] = [
  [
    'WelcomeAnimation',
    WELCOME_DURATION,
    (c) => (
      <WelcomeAnimation
        tenantName="太郎 & 花子"
        eventDate="2026-10-31"
        onComplete={c}
        skipLabel="スキップ"
      />
    ),
  ],
  [
    'UploadComplete',
    UPLOAD_COMPLETE_DURATION,
    (c) => <UploadComplete onComplete={c} skipLabel="スキップ" photoSrc="blob:photo" />,
  ],
  [
    'CoupleCelebration',
    COUPLE_CELEBRATION_DURATION,
    (c) => <CoupleCelebration tenantName="太郎 & 花子" onComplete={c} skipLabel="スキップ" />,
  ],
]

describe.each(fullscreen)('%s（全画面の演出）', (_name, duration, make) => {
  it('定めた長さで onComplete を一度だけ呼び、DOM から消える', () => {
    const onComplete = vi.fn()
    render(wrap(make(onComplete)))
    expect(screen.getByTestId('motion-stage')).toBeInTheDocument()
    advance(duration * 1000 - 50)
    expect(onComplete).not.toHaveBeenCalled()
    advance(50)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('motion-stage')).toBeNull()
    advance(5000)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('スキップのボタンを常に出し、押すとすぐ消えて二重に onComplete を呼ばない', () => {
    const onComplete = vi.fn()
    render(wrap(make(onComplete)))
    const skip = screen.getByRole('button', { name: 'スキップ' })
    expect(skip).toHaveTextContent('スキップ')
    fireEvent.click(skip)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('motion-stage')).toBeNull()
    advance(5000)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('画面のどこをタップしても飛ばせる', () => {
    const onComplete = vi.fn()
    const { container } = render(wrap(make(onComplete)))
    const tap = container.querySelector('.ceremony-tap')
    if (!tap) throw new Error('tap layer not found')
    fireEvent.click(tap)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('motion-stage')).toBeNull()
  })

  it('Escape で飛ばせる。消えたあとの Escape では呼ばない', () => {
    const onComplete = vi.fn()
    render(wrap(make(onComplete)))
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onComplete).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('motion-stage')).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    advance(5000)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('演出の絵は読み上げず、操作できるのはスキップのボタンだけ', () => {
    render(wrap(make(() => {})))
    const stage = screen.getByTestId('motion-stage')
    expect(stage.querySelector('.ceremony-scene')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('背面の画面のスクロールを止めない', () => {
    const before = document.body.getAttribute('style')
    const { unmount } = render(wrap(make(() => {})))
    expect(document.body.getAttribute('style')).toBe(before)
    advance(duration * 1000)
    unmount()
    expect(document.body.getAttribute('style')).toBe(before)
  })

  it('動きを減らす設定では何も表示せず、すぐ onComplete を一度だけ呼ぶ', () => {
    reducedMotion.value = true
    const onComplete = vi.fn()
    const { container } = render(wrap(make(onComplete)))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(container).toBeEmptyDOMElement()
    advance(5000)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('アンマウントするとタイマーとキーの受け付けを片付ける', () => {
    const onComplete = vi.fn()
    const { unmount } = render(wrap(make(onComplete)))
    unmount()
    fireEvent.keyDown(window, { key: 'Escape' })
    advance(5000)
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('演出の長さ', () => {
  it('design-guide.md の上限に収まる', () => {
    expect(WELCOME_DURATION).toBeLessThanOrEqual(3.6)
    expect(COUPLE_CELEBRATION_DURATION).toBeLessThanOrEqual(3.6)
    expect(UPLOAD_COMPLETE_DURATION).toBeLessThanOrEqual(2.4)
  })
})

describe('WelcomeAnimation（金屏風）', () => {
  const welcome = (props: { tenantName: string; eventDate?: string }) =>
    wrap(<WelcomeAnimation {...props} onComplete={() => {}} skipLabel="スキップ" />)

  it('おふたりの名前を一人ずつ縦書きの列にし、歓迎の言葉と日付を添える', () => {
    render(welcome({ tenantName: '太郎 & 花子', eventDate: '2026-10-31' }))
    const names = screen.getByTestId('ceremony-names')
    expect(names).toHaveTextContent('太郎 & 花子')
    expect(names).toHaveAttribute('data-vertical')
    expect(Array.from(names.querySelectorAll('.byobu-name'), (el) => el.textContent)).toEqual([
      '太郎',
      '花子',
    ])
    expect(screen.getByText(ja.ceremony.welcome.greeting)).toBeInTheDocument()
    expect(screen.getByText('2026.10.31')).toBeInTheDocument()
  })

  it('日付を渡さなければ出さない。区切りのない名前はそのまま 1 列にする', () => {
    const { container } = render(welcome({ tenantName: '佐藤家・鈴木家 結婚式' }))
    const names = screen.getByTestId('ceremony-names')
    expect(names).toHaveTextContent('佐藤家・鈴木家 結婚式')
    expect(names.querySelectorAll('.byobu-name')).toHaveLength(0)
    expect(container.querySelector('.byobu-date')).toBeNull()
  })

  it('英字の名前は横倒しにならないよう横書きにする', () => {
    render(welcome({ tenantName: 'Ken & Misaki' }))
    expect(screen.getByTestId('ceremony-names')).not.toHaveAttribute('data-vertical')
  })

  it('6 曲の屏風と、結ばれていく水引を描く', () => {
    const { container } = render(welcome({ tenantName: '太郎 & 花子' }))
    expect(container.querySelectorAll('.byobu-panel')).toHaveLength(6)
    expect(container.querySelector('.byobu-knot svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('CoupleCelebration（向かい鶴）', () => {
  it('二羽の鶴と、おふたりの名前・祝いの言葉を出す', () => {
    const { container } = render(
      wrap(
        <CoupleCelebration tenantName="太郎 & 花子" onComplete={() => {}} skipLabel="スキップ" />,
      ),
    )
    expect(screen.getByTestId('ceremony-names')).toHaveTextContent('太郎 & 花子')
    expect(screen.getByText(ja.ceremony.couple.congrats)).toBeInTheDocument()
    expect(screen.getByText(ja.ceremony.couple.note)).toBeInTheDocument()
    expect(container.querySelectorAll('.tsuru-crane')).toHaveLength(2)
  })
})

describe('UploadComplete（朱印）', () => {
  it('投稿した写真を和紙に置き、御礼の言葉を出す', () => {
    const { container } = render(
      wrap(<UploadComplete onComplete={() => {}} skipLabel="スキップ" photoSrc="blob:photo" />),
    )
    expect(container.querySelector('img.shuin-photo-image')).toHaveAttribute('src', 'blob:photo')
    expect(screen.getByText(ja.ceremony.upload.thanks)).toBeInTheDocument()
  })

  it('写真がなければ色紙を置く', () => {
    const { container } = render(
      wrap(<UploadComplete onComplete={() => {}} skipLabel="スキップ" />),
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.shuin-shikishi')).not.toBeNull()
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
