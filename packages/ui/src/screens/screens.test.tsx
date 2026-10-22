import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CourseMenuView } from './CourseMenuView'
import { formatEventDate, HomeScreen, splitCoupleName } from './HomeScreen'
import { clampTransform, zoomAround } from './PinchZoom'
import { SeatingChartView } from './SeatingChartView'

const hrefs = {
  seating: '/s',
  course: '/c',
  album: '/a',
  upload: '/u',
  nickname: '/n',
}

describe('HomeScreen', () => {
  it('テナント名・日付・あいさつ・変更リンク・新着を出す', () => {
    render(
      <HomeScreen
        tenantName="〇〇家・△△家 結婚式"
        eventDate="2026-10-31"
        nickname="たろう"
        recentPhotos={[
          { id: 'a', src: '/a', nickname: 'はなこ' },
          { id: 'b', src: '/b', nickname: 'はなこ' },
        ]}
        hrefs={hrefs}
      />,
    )
    expect(screen.getByRole('heading', { name: '〇〇家・△△家 結婚式' })).toBeInTheDocument()
    expect(screen.getByText('2026.10.31')).toBeInTheDocument()
    expect(screen.getByText('こんにちは、たろう さん')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '変更' })).toHaveAttribute('href', '/n')
    expect(screen.getAllByAltText('はなこ さんの写真')).toHaveLength(2)
  })

  it('新着がなければ新着を出さない', () => {
    render(<HomeScreen tenantName="t" eventDate="2026-10-31" nickname="n" hrefs={hrefs} />)
    expect(screen.queryByText('新着')).not.toBeInTheDocument()
  })

  it('日付の形式', () => {
    expect(formatEventDate('2026-01-05')).toBe('2026.01.05')
  })

  it('表紙の名前は縦書きの列に分けても、見出しの名前はテナント名のまま', () => {
    render(
      <HomeScreen
        tenantName="佐藤 健太 & 鈴木 美咲"
        eventDate="2026-10-31"
        nickname="n"
        hrefs={hrefs}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: '佐藤 健太 & 鈴木 美咲' }),
    ).toBeInTheDocument()
    expect(screen.getByText('佐藤 健太')).toBeInTheDocument()
    expect(screen.getByText('鈴木 美咲')).toBeInTheDocument()
  })

  it('写真がなければ、最初の一枚を待つ表示とアルバムへの導線を出す', () => {
    render(<HomeScreen tenantName="t" eventDate="2026-10-31" nickname="n" hrefs={hrefs} />)
    expect(
      screen.getByText('まだ写真がありません。最初の一枚を、お待ちしています'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /アルバムを見る/ })).toHaveAttribute('href', '/a')
  })

  it('写真を贈る入口（祝儀袋）は「写真を投稿する」として投稿へ移る', () => {
    render(<HomeScreen tenantName="t" eventDate="2026-10-31" nickname="n" hrefs={hrefs} />)
    expect(screen.getByRole('link', { name: '写真を投稿する' })).toHaveAttribute('href', '/u')
  })
})

describe('splitCoupleName', () => {
  it('区切り（&・＆・「・」・と）でおふたりの名前に分ける', () => {
    expect(splitCoupleName('佐藤 健太 & 鈴木 美咲')).toEqual({
      names: ['佐藤 健太', '鈴木 美咲'],
      separator: '&',
    })
    expect(splitCoupleName('〇〇家・△△家 結婚式')).toEqual({
      names: ['〇〇家', '△△家 結婚式'],
      separator: '・',
    })
    expect(splitCoupleName('太郎 と 花子')).toEqual({ names: ['太郎', '花子'], separator: 'と' })
  })

  it('区切りがないときは 1 つのまま', () => {
    expect(splitCoupleName('山田家 結婚式')).toEqual({ names: ['山田家 結婚式'], separator: null })
    expect(splitCoupleName('& 花子')).toEqual({ names: ['& 花子'], separator: null })
  })
})

describe('席次表・コース表の未登録', () => {
  it('席次表', () => {
    render(<SeatingChartView pdfUrl={null} workerSrc="/worker.js" />)
    expect(screen.getByText('席次表は準備中です')).toBeInTheDocument()
  })

  it('コース表', () => {
    render(<CourseMenuView images={[]} />)
    expect(screen.getByText('コースのご案内は準備中です')).toBeInTheDocument()
  })
})

describe('PinchZoom の計算', () => {
  const size = { width: 300, height: 400 }

  it('倍率は 1 以上 最大以下に収める', () => {
    expect(clampTransform({ scale: 0.5, x: -10, y: -10 }, size, 4)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    })
    expect(clampTransform({ scale: 9, x: 0, y: 0 }, size, 4).scale).toBe(4)
  })

  it('移動は枠からはみ出さない', () => {
    expect(clampTransform({ scale: 2, x: 50, y: -999 }, size, 4)).toEqual({
      scale: 2,
      x: 0,
      y: -400,
    })
  })

  it('指の位置を動かさずに拡大する', () => {
    const next = zoomAround({ scale: 1, x: 0, y: 0 }, { x: 100, y: 100 }, 2)
    expect(next).toEqual({ scale: 2, x: -100, y: -100 })
  })
})
