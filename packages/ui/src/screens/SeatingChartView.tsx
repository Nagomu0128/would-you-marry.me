import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../components/cn'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Skeleton } from '../components/Skeleton'
import { ja } from '../messages/ja'
import { PinchZoom } from './PinchZoom'

/** ピンチで拡大しても読めるよう、表示の幅に対して何倍の画素で描くか（端末の画素密度に掛ける） */
export const PDF_RENDER_OVERSAMPLE = 2
/** 描く幅の上限（画素）。端末のメモリを使い切らないための上限 */
export const PDF_MAX_CANVAS_WIDTH_PX = 2048
/** 端末の画素密度の上限 */
const MAX_PIXEL_RATIO = 3

export type SeatingChartViewProps = {
  /** 席次表 PDF の URL。未登録なら null */
  pdfUrl: string | null
  /** PDF.js の worker の URL。アプリ側で Vite の `?url` を使って読み込んで渡す */
  workerSrc: string
  className?: string
}

type PdfState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; doc: PDFDocumentProxy; aspects: number[] }

/**
 * 席次表（PDF）の表示。全ページを縦に並べ、端末の画素密度に合わせて高精細に描く。
 * 各ページはピンチ・ダブルタップで拡大し、拡大中は指で動かせる（最大 4 倍）。
 * データの取得はしない。PDF.js は表示するときに読み込む。
 */
export function SeatingChartView({ pdfUrl, workerSrc, className }: SeatingChartViewProps) {
  if (pdfUrl === null) {
    return <EmptyState className={className} message={ja.guest.seating.empty} />
  }
  return <PdfPages pdfUrl={pdfUrl} workerSrc={workerSrc} className={className} />
}

function PdfPages({ pdfUrl, workerSrc, className }: SeatingChartViewProps & { pdfUrl: string }) {
  const [state, setState] = useState<PdfState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  // 表示の幅を測る（向きの変更などで変わったら描き直す）
  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    setWidth(Math.round(node.clientWidth))
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setWidth(Math.round(node.clientWidth)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt は「もう一度試す」で読み込み直すための合図
  useEffect(() => {
    let cancelled = false
    let destroy: (() => void) | undefined
    setState({ status: 'loading' })

    const load = async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
      const task = pdfjs.getDocument({ url: pdfUrl })
      destroy = () => {
        void task.destroy()
      }
      const doc = await task.promise
      const aspects: number[] = []
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n)
        const viewport = page.getViewport({ scale: 1 })
        aspects.push(viewport.height / viewport.width)
      }
      if (!cancelled) setState({ status: 'ready', doc, aspects })
    }

    load().catch(() => {
      if (!cancelled) setState({ status: 'error' })
    })

    return () => {
      cancelled = true
      destroy?.()
    }
  }, [pdfUrl, workerSrc, attempt])

  return (
    <div ref={containerRef} className={cn('flex flex-col gap-3', className)}>
      {state.status === 'loading' ? <Skeleton className="aspect-[1/1.414] w-full" /> : null}
      {state.status === 'error' ? <ErrorState onRetry={() => setAttempt((n) => n + 1)} /> : null}
      {state.status === 'ready' && width > 0 ? (
        <Pages doc={state.doc} aspects={state.aspects} width={width} />
      ) : null}
    </div>
  )
}

function Pages({
  doc,
  aspects,
  width,
}: {
  doc: PDFDocumentProxy
  aspects: number[]
  width: number
}) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const [renderedCount, setRenderedCount] = useState(0)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt は「もう一度試す」で描き直すための合図
  useEffect(() => {
    let cancelled = false
    let current: RenderTask | null = null
    setRenderedCount(0)
    setFailed(false)

    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
    const targetWidth = Math.min(width * ratio * PDF_RENDER_OVERSAMPLE, PDF_MAX_CANVAS_WIDTH_PX)

    const renderAll = async () => {
      // メモリを使いすぎないよう、1 ページずつ順に描く
      for (let n = 1; n <= doc.numPages; n++) {
        const canvas = canvasRefs.current[n - 1]
        if (cancelled || !canvas) return
        const page = await doc.getPage(n)
        // Strict Mode or a resize can cancel this pass while getPage is pending.
        if (cancelled) return
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: targetWidth / base.width })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        current = page.render({ canvas, viewport })
        await current.promise
        if (cancelled) return
        setRenderedCount(n)
      }
    }

    renderAll().catch(() => {
      if (!cancelled) setFailed(true)
    })

    return () => {
      cancelled = true
      current?.cancel()
    }
  }, [doc, width, attempt])

  if (failed) return <ErrorState onRetry={() => setAttempt((n) => n + 1)} />

  return (
    <>
      {aspects.map((aspect, index) => (
        // ページは並び替わらないので、番号を key にしてよい
        // biome-ignore lint/suspicious/noArrayIndexKey: PDF のページ番号
        <PinchZoom key={index} className="document-sheet">
          <div className="relative" style={{ aspectRatio: `1 / ${aspect}` }}>
            <canvas
              role="img"
              aria-label={`席次表 ${index + 1} ページ目`}
              ref={(node) => {
                canvasRefs.current[index] = node
              }}
              className="block size-full"
            />
            {index >= renderedCount ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
          </div>
        </PinchZoom>
      ))}
    </>
  )
}
