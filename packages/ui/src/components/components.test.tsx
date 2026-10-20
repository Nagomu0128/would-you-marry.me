import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactNode, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ja } from '../messages/ja'
import { MotionProvider } from '../motion'
import {
  BottomNav,
  Button,
  Card,
  Checkbox,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Footer,
  type LinkProps,
  ListCard,
  PageTransition,
  PhotoGrid,
  type PhotoGridItem,
  ScreenHeader,
  Skeleton,
  Tabs,
  TextField,
  ToastProvider,
  useToast,
} from '.'

function wrap(ui: ReactNode) {
  return render(<MotionProvider>{ui}</MotionProvider>)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Button', () => {
  it('押せる。disabled と loading のときは押せない', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const { rerender } = wrap(<Button onClick={onClick}>はじめる</Button>)
    await user.click(screen.getByRole('button', { name: 'はじめる' }))
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <MotionProvider>
        <Button onClick={onClick} disabled>
          はじめる
        </Button>
      </MotionProvider>,
    )
    expect(screen.getByRole('button')).toBeDisabled()

    rerender(
      <MotionProvider>
        <Button onClick={onClick} loading>
          はじめる
        </Button>
      </MotionProvider>,
    )
    const loading = screen.getByRole('button')
    expect(loading).toBeDisabled()
    expect(loading).toHaveAttribute('aria-busy', 'true')
    await user.click(loading)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('高さ 48px のクラスと、種類ごとの見た目を持つ', () => {
    wrap(
      <>
        <Button>主要</Button>
        <Button variant="secondary">補助</Button>
        <Button variant="text">テキスト</Button>
        <Button danger>危険</Button>
      </>,
    )
    expect(screen.getByText('主要')).toHaveClass('h-control', 'bg-charcoal')
    expect(screen.getByText('補助')).toHaveClass('border-charcoal')
    expect(screen.getByText('テキスト')).toHaveClass('text-deep-gold')
    expect(screen.getByText('危険')).toHaveClass('bg-error')
  })
})

describe('TextField', () => {
  it('ラベルで入力欄を引け、文字数カウンターとエラーを関連づける', () => {
    render(
      <TextField
        label="ニックネーム"
        value="たろう"
        count={3}
        max={20}
        error="エラーです"
        readOnly
      />,
    )
    const input = screen.getByLabelText('ニックネーム')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('3 / 20')).toBeInTheDocument()
    const describedBy = input.getAttribute('aria-describedby') ?? ''
    const errorEl = screen.getByText('エラーです')
    expect(describedBy.split(' ')).toContain(errorEl.id)
    expect(describedBy.split(' ')).toContain(screen.getByText('3 / 20').id)
  })

  it('エラーがなければ aria-invalid を付けない。入力できる', async () => {
    const user = userEvent.setup()
    function Controlled() {
      const [value, setValue] = useState('')
      return (
        <TextField label="名前" value={value} onChange={(event) => setValue(event.target.value)} />
      )
    }
    render(<Controlled />)
    const input = screen.getByLabelText('名前')
    expect(input).not.toHaveAttribute('aria-invalid')
    await user.type(input, 'abc')
    expect(input).toHaveValue('abc')
  })
})

describe('Checkbox', () => {
  it('リンクを含むラベルを渡せ、ラベルのタップで切り替わる', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Checkbox
        onChange={onChange}
        label={
          <>
            <a href="/terms">{ja.guest.nickname.agree.terms}</a>
            {ja.guest.nickname.agree.after}
          </>
        }
      />,
    )
    expect(screen.getByRole('link', { name: '利用規約' })).toHaveAttribute('href', '/terms')
    await user.click(screen.getByText('に同意します', { exact: false }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})

describe('Tabs', () => {
  const tabs = [
    { id: 'timeline', label: ja.guest.album.tabs.timeline },
    { id: 'ranking', label: ja.guest.album.tabs.ranking },
  ] as const

  it('選択中のタブを示し、クリックと矢印キーで切り替える', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [value, setValue] = useState<'timeline' | 'ranking'>('timeline')
      return <Tabs tabs={tabs} value={value} onChange={setValue} />
    }
    wrap(<Harness />)
    expect(screen.getByRole('tab', { name: 'タイムライン' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await user.click(screen.getByRole('tab', { name: 'ランキング' }))
    expect(screen.getByRole('tab', { name: 'ランキング' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'タイムライン' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })
})

describe('Card / ListCard', () => {
  it('Card は中身を表示する', () => {
    render(<Card>内容</Card>)
    expect(screen.getByText('内容')).toHaveClass('rounded-card', 'shadow-card')
  })

  it('ListCard は href と LinkComponent でリンクになる', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    const Link = ({ href, children, onClick, className }: LinkProps) => (
      <a
        href={href}
        data-custom="1"
        className={className}
        onClick={(event) => {
          event.preventDefault()
          onClick?.(event)
        }}
      >
        {children}
      </a>
    )
    render(
      <ListCard title="アルバム" href="/album" LinkComponent={Link} onNavigate={onNavigate}>
        12 枚
      </ListCard>,
    )
    const link = screen.getByRole('link', { name: /アルバム/ })
    expect(link).toHaveAttribute('href', '/album')
    expect(link).toHaveAttribute('data-custom', '1')
    expect(screen.getByText('12 枚')).toBeInTheDocument()
    await user.click(link)
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('href がなければボタンになる', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(<ListCard title="席次表" onNavigate={onNavigate} />)
    await user.click(screen.getByRole('button', { name: '席次表' }))
    expect(onNavigate).toHaveBeenCalled()
  })
})

describe('ScreenHeader', () => {
  it('戻るボタンは「戻る」と読み上げ、タイトルを見出しにする', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<ScreenHeader title="ニックネームの変更" onBack={onBack} />)
    expect(screen.getByRole('heading', { name: 'ニックネームの変更' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '戻る' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('backHref があればリンクで戻る', () => {
    render(<ScreenHeader title="料理のコース" backHref="/" />)
    expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '/')
  })

  it('戻り先がなければ戻るボタンを出さない', () => {
    render(<ScreenHeader title="ホーム" />)
    expect(screen.queryByRole('link', { name: '戻る' })).toBeNull()
    expect(screen.queryByRole('button', { name: '戻る' })).toBeNull()
  })
})

describe('Footer', () => {
  it('3 つのリンクを出し、お問い合わせは mailto になる', () => {
    render(<Footer termsHref="/terms" privacyHref="/privacy" contactEmail="help@example.com" />)
    expect(screen.getByRole('link', { name: '利用規約' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute(
      'href',
      '/privacy',
    )
    expect(screen.getByRole('link', { name: 'お問い合わせ' })).toHaveAttribute(
      'href',
      'mailto:help@example.com',
    )
  })
})

describe('BottomNav', () => {
  const hrefs = {
    home: '/',
    album: '/album',
    upload: '/upload',
    seating: '/seating',
    course: '/course',
  }

  it('5 つの項目を順に出し、現在地に aria-current を付ける', () => {
    render(<BottomNav current="album" hrefs={hrefs} />)
    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'ホーム',
      'アルバム',
      '投稿',
      '席次表',
      '料理',
    ])
    expect(screen.getByRole('link', { name: 'アルバム' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'ホーム' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: '投稿' })).toHaveAttribute('href', '/upload')
  })

  it('押すと onNavigate にキーが渡る', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(
      <BottomNav
        hrefs={hrefs}
        onNavigate={onNavigate}
        LinkComponent={({ href, children, onClick, ...rest }) => (
          <a
            href={href}
            {...rest}
            onClick={(event) => {
              event.preventDefault()
              onClick?.(event)
            }}
          >
            {children}
          </a>
        )}
      />,
    )
    await user.click(screen.getByRole('link', { name: '料理' }))
    expect(onNavigate).toHaveBeenCalledWith('course')
  })
})

describe('Toast', () => {
  function Trigger() {
    const toast = useToast()
    return (
      <button type="button" onClick={() => toast.show(ja.toasts.saved)}>
        出す
      </button>
    )
  }

  it('表示して 3 秒後に消える', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    wrap(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    await user.click(screen.getByRole('button', { name: '出す' }))
    expect(screen.getByText('保存しました')).toBeInTheDocument()
    expect(screen.getByRole('status')).toContainElement(screen.getByText('保存しました'))
    await act(async () => {
      vi.advanceTimersByTime(2900)
    })
    expect(screen.getByText('保存しました')).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    await vi.waitFor(() => expect(screen.queryByText('保存しました')).toBeNull())
  })

  it('ToastProvider の外で useToast を使うとエラー', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger />)).toThrow()
    spy.mockRestore()
  })
})

describe('ConfirmSheet', () => {
  it('本文・確定・キャンセルを出し、確定とキャンセルが呼ばれる', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    wrap(
      <ConfirmSheet
        open
        onClose={onClose}
        onConfirm={onConfirm}
        body={ja.confirms.deletePhotoGuest.body}
        confirmLabel={ja.confirms.deletePhotoGuest.confirm}
        cancelLabel={ja.confirms.deletePhotoGuest.cancel}
        danger
      />,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText(ja.confirms.deletePhotoGuest.body)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '削除する' })).toHaveClass('bg-error')
    // 最初のフォーカスは、危険な操作ではなくキャンセル
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: '削除する' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc で閉じ、Tab はシートの中で循環する', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    wrap(
      <ConfirmSheet
        open
        onClose={onClose}
        onConfirm={() => {}}
        body="本文"
        confirmLabel="再開する"
        cancelLabel="キャンセル"
      />,
    )
    // キャンセル → Tab で先頭の確定へ戻る（循環）
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: '再開する' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('テキスト入力つきにでき、入力欄にフォーカスが移る', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [value, setValue] = useState('')
      return (
        <ConfirmSheet
          open
          onClose={() => {}}
          onConfirm={() => {}}
          body={ja.confirms.deleteTenant.body({ name: 'A家' })}
          confirmLabel="削除する"
          cancelLabel="キャンセル"
          danger
          input={{
            label: 'テナント名',
            value,
            onChange: setValue,
            error: 'テナント名が一致しません',
          }}
        />
      )
    }
    wrap(<Harness />)
    const input = screen.getByLabelText('テナント名')
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    await user.type(input, 'A家')
    expect(input).toHaveValue('A家')
  })

  it('閉じているときは何も出さない', () => {
    wrap(
      <ConfirmSheet
        open={false}
        onClose={() => {}}
        onConfirm={() => {}}
        body="本文"
        confirmLabel="OK"
        cancelLabel="キャンセル"
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Skeleton / EmptyState / ErrorState', () => {
  it('Skeleton は読み上げの対象にしない', () => {
    render(<Skeleton className="h-4 w-1/2" />)
    expect(screen.getByTestId('skeleton')).toHaveAttribute('aria-hidden', 'true')
  })

  it('EmptyState は文言を出す', () => {
    render(<EmptyState message={ja.guest.seating.empty} />)
    expect(screen.getByText('席次表は準備中です')).toBeInTheDocument()
  })

  it('ErrorState は通信エラーの文言と「もう一度試す」を出す', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    wrap(<ErrorState onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent(ja.errors.network)
    await user.click(screen.getByRole('button', { name: 'もう一度試す' }))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('PhotoGrid', () => {
  const photos: PhotoGridItem[] = [
    { id: 'p1', src: '/p1.jpg', nickname: 'たろう', likeCount: 12, liked: true },
    { id: 'p2', src: '/p2.jpg', nickname: 'はなこ', likeCount: 0 },
  ]

  it('代替テキスト・いいね数の読み上げ・lazy loading を持ち、タップで onSelect を呼ぶ', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    wrap(<PhotoGrid photos={photos} onSelect={onSelect} />)
    const img = screen.getByAltText('たろう さんの写真')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(screen.getByText('いいね 12 件')).toBeInTheDocument()
    expect(screen.getByText('いいね 0 件')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /はなこ さんの写真/ }))
    expect(onSelect).toHaveBeenCalledWith(photos[1], 1)
  })

  it('3 列・間隔 2px・正方形・角丸 4px のクラスを持つ', () => {
    wrap(<PhotoGrid photos={photos} />)
    expect(screen.getByRole('list')).toHaveClass('grid-cols-3', 'gap-0.5')
    expect(screen.getAllByRole('button')[0]).toHaveClass('aspect-square', 'rounded-photo')
  })

  it('末尾が見えたら onReachEnd を呼ぶ', () => {
    const callbacks: IntersectionObserverCallback[] = []
    class FakeObserver {
      constructor(callback: IntersectionObserverCallback) {
        callbacks.push(callback)
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return []
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const onReachEnd = vi.fn()
    wrap(<PhotoGrid photos={photos} onReachEnd={onReachEnd} />)
    const callback = callbacks.at(-1)
    callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    expect(onReachEnd).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})

describe('PageTransition', () => {
  it('中身を表示する', () => {
    wrap(
      <PageTransition>
        <p>画面</p>
      </PageTransition>,
    )
    expect(screen.getByText('画面')).toBeInTheDocument()
  })
})
