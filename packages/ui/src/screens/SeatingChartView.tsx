import { X } from 'lucide-react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../components/cn'
import { Dialog } from '../components/Dialog'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Skeleton } from '../components/Skeleton'
import { ja } from '../messages/ja'
import { PinchZoom } from './PinchZoom'

/** ピンチで拡大しても読めるよう、表示の幅に対して何倍の画素で描くか（端末の画素密度に掛ける） */
export const PDF_RENDER_OVERSAMPLE = 2
/** 描く幅の上限（画素）。端末のメモリを使い切らないための上限 */
export const PDF_MAX_CANVAS_WIDTH_PX = 2048
/** 全画面表示は拡大して読むので、プレビューより高い解像度で描く */
const PDF_VIEWER_MAX_CANVAS_WIDTH_PX = 3072
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
 * 席次表（PDF）の表示。額装した席次表の見立てで、全ページを縦に並べ、端末の画素密度に合わせて高精細に描く。
 * 各ページをタップすると全画面で開く。横長ページは携帯で最初から拡大する。
 * データの取得はしない。PDF.js は表示するときに読み込む。
 */
export function SeatingChartView({ pdfUrl, workerSrc, className }: SeatingChartViewProps) {
  return (
    <div className={cn('document-frame', className)} data-empty={pdfUrl === null || undefined}>
      <p className="frame-mark" aria-hidden="true">
        {ja.guest.seating.mark}
      </p>
      {pdfUrl === null ? (
        <EmptyState message={ja.guest.seating.empty} ornament="mizuhiki" />
      ) : (
        <PdfPages pdfUrl={pdfUrl} workerSrc={workerSrc} />
      )}
    </div>
  )
}

function PdfPages({ pdfUrl, workerSrc }: { pdfUrl: string; workerSrc: string }) {
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
      const task = pdfjs.getDocument({
        url: pdfUrl,
        cMapUrl: `${window.location.origin}/pdfjs-cmaps/`,
        cMapPacked: true,
      })
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
    <div ref={containerRef} className="document-gallery">
      {state.status === 'loading' ? <Skeleton className="aspect-[1.414/1] w-full" /> : null}
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
  const [openPage, setOpenPage] = useState<number | null>(null)

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

  const pages = aspects.map((aspect, index) => ({ aspect, number: index + 1 }))

  return (
    <>
      {pages.map(({ aspect, number }) => (
        <button
          key={number}
          type="button"
          onClick={() => setOpenPage(number)}
          className="document-sheet"
          aria-label={ja.guest.seating.openPage({ page: number })}
        >
          <div className="relative" style={{ aspectRatio: `1 / ${aspect}` }}>
            <canvas
              ref={(node) => {
                canvasRefs.current[number - 1] = node
              }}
              className="block size-full"
            />
            {number > renderedCount ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
          </div>
          <span className="document-caption" aria-hidden="true">
            <span className="font-numeral">
              {number} / {aspects.length}
            </span>
            <span>{ja.guest.seating.openHint}</span>
          </span>
        </button>
      ))}
      {openPage !== null ? (
        <PdfLightbox
          doc={doc}
          pageNumber={openPage}
          aspect={aspects[openPage - 1] ?? 1}
          onClose={() => setOpenPage(null)}
        />
      ) : null}
    </>
  )
}

function PdfLightbox({
  doc,
  pageNumber,
  aspect,
  onClose,
}: {
  doc: PDFDocumentProxy
  pageNumber: number
  aspect: number
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const label = ja.guest.seating.pageAlt({ page: pageNumber })
  const initialScale = aspect < 1 && window.innerWidth < 640 ? 3 : 1

  useEffect(() => {
    let cancelled = false
    let current: RenderTask | null = null
    const render = async () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const page = await doc.getPage(pageNumber)
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
      const targetWidth = Math.min(
        Math.max(window.innerWidth * ratio * initialScale, 1600),
        PDF_VIEWER_MAX_CANVAS_WIDTH_PX,
      )
      const viewport = page.getViewport({ scale: targetWidth / base.width })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      current = page.render({ canvas, viewport })
      await current.promise
      if (!cancelled) setReady(true)
    }
    render().catch(() => {
      if (!cancelled) setFailed(true)
    })
    return () => {
      cancelled = true
      current?.cancel()
    }
  }, [doc, pageNumber, initialScale])

  return (
    <Dialog fullScreen onClose={onClose} label={label}>
      <PinchZoom
        className="size-full"
        contentClassName="flex size-full items-center justify-center"
        initialScale={initialScale}
        maxScale={5}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          className="viewer-image block"
          style={{ aspectRatio: `1 / ${aspect}` }}
        />
        {!ready && !failed ? <Skeleton className="absolute inset-4" /> : null}
        {failed ? <ErrorState /> : null}
      </PinchZoom>
      <button
        type="button"
        onClick={onClose}
        aria-label={ja.common.viewer.close}
        className="viewer-button lightbox-close"
        data-shape="round"
      >
        <X aria-hidden="true" strokeWidth={1.25} />
      </button>
    </Dialog>
  )
}
