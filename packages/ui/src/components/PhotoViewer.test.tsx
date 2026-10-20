import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Photo } from '@wym/shared'
import { type ReactNode, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ja } from '../messages/ja'
import { MotionProvider } from '../motion'
import { PhotoViewer, type PhotoViewerProps } from './PhotoViewer'

function photo(id: string, extra: Partial<Photo> = {}): Photo {
  return {
    id,
    uploader: { nickname: `name-${id}` },
    likeCount: 3,
    likedByMe: false,
    isMine: false,
    width: 1600,
    height: 1200,
    createdAt: '2026-10-31T00:00:00.000Z',
    urls: {
      thumb: `/p/${id}/thumb`,
      display: `/p/${id}/display`,
      original: `/p/${id}/original`,
    },
    ...extra,
  }
}

const photos = [photo('a'), photo('b', { isMine: true, likedByMe: true }), photo('c')]

function Harness({
  start = 0,
  children,
  ...props
}: { start?: number; children?: ReactNode } & Partial<PhotoViewerProps<Photo>>) {
  const [index, setIndex] = useState(start)
  return (
    <MotionProvider>
      <PhotoViewer
        photos={photos}
        index={index}
        onIndexChange={setIndex}
        onClose={() => {}}
        onSave={() => {}}
        {...props}
      />
      {children}
    </MotionProvider>
  )
}

describe('PhotoViewer', () => {
  it('拡大表示用の画像・代替テキスト・投稿者・いいね数を表示する', () => {
    render(<Harness />)
    const image = screen.getByRole('img', { name: ja.common.photoAlt({ nickname: 'name-a' }) })
    expect(image).toHaveAttribute('src', '/p/a/display')
    expect(screen.getByText(ja.common.uploader({ nickname: 'name-a' }))).toBeInTheDocument()
    expect(screen.getByText(ja.common.likeCount({ count: 3 }))).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('新郎新婦・管理者向け: いいねのボタンがなく、いいね数だけ表示する', () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: ja.common.viewer.like })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: ja.common.viewer.unlike })).not.toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: ja.common.viewer.save })).toBeInTheDocument()
  })

  it('削除は canDelete が true の写真だけ（参加者の他人の写真にはない）', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        onToggleLike={() => {}}
        canDelete={(p) => p.isMine === true}
        onDelete={async () => true}
      />,
    )
    expect(screen.queryByRole('button', { name: ja.common.viewer.delete })).not.toBeInTheDocument()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: ja.common.viewer.delete })).toBeInTheDocument()
  })

  it('onDelete がなければ canDelete が true でも削除は出ない（新郎新婦）', () => {
    render(<Harness start={1} canDelete={() => true} />)
    expect(screen.queryByRole('button', { name: ja.common.viewer.delete })).not.toBeInTheDocument()
  })

  it('削除: 確認シートで確定すると onDelete を呼び、消せたら閉じる', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn(async () => true)
    const onClose = vi.fn()
    render(<Harness start={1} canDelete={() => true} onDelete={onDelete} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: ja.common.viewer.delete }))
    expect(screen.getByText(ja.confirms.deletePhotoGuest.body)).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: ja.confirms.deletePhotoGuest.confirm }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onDelete).toHaveBeenCalledWith(photos[1])
  })

  it('削除に失敗（false）したら閉じない', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Harness start={1} canDelete={() => true} onDelete={async () => false} onClose={onClose} />,
    )
    await user.click(screen.getByRole('button', { name: ja.common.viewer.delete }))
    await user.click(screen.getByRole('button', { name: ja.confirms.deletePhotoGuest.confirm }))
    await waitFor(() =>
      expect(screen.queryByText(ja.confirms.deletePhotoGuest.body)).not.toBeInTheDocument(),
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it('削除の確認のキャンセルでは onDelete を呼ばない', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn(async () => true)
    render(<Harness start={1} canDelete={() => true} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: ja.common.viewer.delete }))
    await user.click(screen.getByRole('button', { name: ja.confirms.deletePhotoGuest.cancel }))
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('いいね: 押すと onToggleLike を呼ぶ。いいね済みは押下状態と取り消しの名前で区別する', async () => {
    const user = userEvent.setup()
    const onToggleLike = vi.fn()
    render(<Harness onToggleLike={onToggleLike} />)
    const like = screen.getByRole('button', { name: ja.common.viewer.like })
    expect(like).toHaveAttribute('aria-pressed', 'false')
    await user.click(like)
    expect(onToggleLike).toHaveBeenCalledWith(photos[0])

    await user.keyboard('{ArrowRight}')
    const unlike = screen.getByRole('button', { name: ja.common.viewer.unlike })
    expect(unlike).toHaveAttribute('aria-pressed', 'true')
    expect(unlike.querySelector('svg')).toHaveClass('fill-rose')
  })

  it('いいねしたとき LikeBurst を出す', () => {
    function Liking() {
      const [liked, setLiked] = useState(false)
      const list = [photo('a', { likedByMe: liked })]
      return (
        <MotionProvider>
          <PhotoViewer
            photos={list}
            index={0}
            onIndexChange={() => {}}
            onClose={() => {}}
            onSave={() => {}}
            onToggleLike={() => setLiked((v) => !v)}
          />
        </MotionProvider>
      )
    }
    render(<Liking />)
    expect(screen.queryByTestId('like-burst')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: ja.common.viewer.like }))
    expect(screen.getByTestId('like-burst')).toBeInTheDocument()
  })

  it('キーボードで前後に移動できる。端では動かない', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByText(ja.common.uploader({ nickname: 'name-a' }))).toBeInTheDocument()
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(screen.getByText(ja.common.uploader({ nickname: 'name-c' }))).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByText(ja.common.uploader({ nickname: 'name-b' }))).toBeInTheDocument()
  })

  it('左右のスワイプで前後に移動し、下へのスワイプで閉じる', () => {
    const onClose = vi.fn()
    render(<Harness start={1} onClose={onClose} />)
    const stage = screen.getByTestId('viewer-stage')
    const swipe = (from: [number, number], to: [number, number]) => {
      fireEvent.pointerDown(stage, { pointerId: 1, clientX: from[0], clientY: from[1] })
      fireEvent.pointerUp(stage, { pointerId: 1, clientX: to[0], clientY: to[1] })
    }
    swipe([200, 300], [80, 310])
    expect(screen.getByText(ja.common.uploader({ nickname: 'name-c' }))).toBeInTheDocument()
    swipe([80, 300], [220, 300])
    expect(screen.getByText(ja.common.uploader({ nickname: 'name-b' }))).toBeInTheDocument()
    // 短い移動では動かない
    swipe([100, 300], [130, 300])
    expect(screen.getByText(ja.common.uploader({ nickname: 'name-b' }))).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    swipe([150, 200], [155, 380])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('× と Esc で閉じる。開くと × にフォーカスが移る', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const close = screen.getByRole('button', { name: ja.common.viewer.close })
    expect(close).toHaveFocus()
    await user.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('保存: onSave を呼び、完了までボタンを押せない（二重に呼ばない）', async () => {
    const user = userEvent.setup()
    let finish: () => void = () => {}
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    render(<Harness onSave={onSave} />)
    const save = screen.getByRole('button', { name: ja.common.viewer.save })
    await user.click(save)
    expect(onSave).toHaveBeenCalledWith(photos[0])
    expect(save).toHaveAttribute('aria-disabled', 'true')
    expect(save).toHaveAttribute('aria-busy', 'true')
    await user.click(save)
    expect(onSave).toHaveBeenCalledTimes(1)
    finish()
    await waitFor(() => expect(save).toHaveAttribute('aria-disabled', 'false'))
  })

  it('一覧の写真の位置が分かっても問題なく開く', () => {
    const tile = document.createElement('button')
    tile.dataset.photoId = 'a'
    tile.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }) as DOMRect
    document.body.append(tile)
    render(<Harness />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    tile.remove()
  })
})
