import { type ReactNode, useEffect, useRef } from 'react'
import { cn } from '../components/cn'

export type PinchZoomProps = {
  children: ReactNode
  /** 最大の倍率（既定 4） */
  maxScale?: number
  /** ダブルタップで拡大するときの倍率（既定 2.5。最大倍率を超えない） */
  doubleTapScale?: number
  /** 外側の枠。大きさは呼び出し側が決める（中身はこの枠の中で拡大・移動する） */
  className?: string
  /** 中身を包む要素のクラス。枠いっぱいに広げて中央に置くときなどに使う */
  contentClassName?: string
  /** 拡大中かどうかが変わったとき（拡大中は左右のスワイプを呼び出し側で無効にするなど） */
  onZoomChange?: (zoomed: boolean) => void
  /** 倍率 1 のときの `touch-action`（既定 `pan-y`）。全画面の表示などでスクロールさせないときは `none` */
  idleTouchAction?: 'pan-y' | 'none'
}

export const DEFAULT_MAX_SCALE = 4
export const DEFAULT_DOUBLE_TAP_SCALE = 2.5
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_DISTANCE = 32

type Point = { x: number; y: number }
type Transform = { scale: number; x: number; y: number }

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 }

/** 拡大した中身が枠からはみ出さないよう、移動量を収める */
export function clampTransform(
  t: Transform,
  size: { width: number; height: number },
  maxScale: number,
): Transform {
  const scale = Math.min(Math.max(t.scale, 1), maxScale)
  if (scale === 1) return IDENTITY
  const minX = size.width - size.width * scale
  const minY = size.height - size.height * scale
  return {
    scale,
    x: Math.min(0, Math.max(minX, t.x)),
    y: Math.min(0, Math.max(minY, t.y)),
  }
}

/** 指（点）の位置を動かさずに倍率を変えたときの移動量 */
export function zoomAround(t: Transform, point: Point, nextScale: number): Transform {
  const ratio = nextScale / t.scale
  return {
    scale: nextScale,
    x: point.x - (point.x - t.x) * ratio,
    y: point.y - (point.y - t.y) * ratio,
  }
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * ピンチで拡大・移動できる枠。transform だけで動かす。
 * - 倍率 1 のときは `touch-action: pan-y` で、縦のスクロールをブラウザに任せる
 * - 拡大中は 1 本指のドラッグで移動し、ダブルタップ（クリック）で戻す。1 倍のダブルタップで拡大する
 * - PC ではトラックパッドのピンチ（Ctrl + ホイール）でも拡大できる
 */
export function PinchZoom({
  children,
  maxScale = DEFAULT_MAX_SCALE,
  doubleTapScale = DEFAULT_DOUBLE_TAP_SCALE,
  className,
  contentClassName,
  onZoomChange,
  idleTouchAction = 'pan-y',
}: PinchZoomProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const onZoomChangeRef = useRef(onZoomChange)
  onZoomChangeRef.current = onZoomChange

  useEffect(() => {
    const frame = frameRef.current
    const content = contentRef.current
    if (!frame || !content) return

    let current: Transform = IDENTITY
    const pointers = new Map<number, Point>()
    let pinch: { distance: number; start: Transform; mid: Point } | null = null
    let lastTap: { time: number; point: Point } | null = null
    let moved = false
    let zoomed = false

    const size = () => ({ width: frame.clientWidth, height: frame.clientHeight })

    const apply = (next: Transform, animate: boolean) => {
      current = clampTransform(next, size(), maxScale)
      content.style.transition =
        animate && !prefersReducedMotion() ? 'transform 200ms ease-out' : 'none'
      content.style.transform =
        current.scale === 1
          ? 'none'
          : `translate3d(${current.x}px, ${current.y}px, 0) scale(${current.scale})`
      // 拡大中は移動を自分で扱う。1 倍のときは縦のスクロールをブラウザに任せる
      frame.style.touchAction = current.scale > 1 ? 'none' : idleTouchAction
      if (zoomed !== current.scale > 1) {
        zoomed = current.scale > 1
        onZoomChangeRef.current?.(zoomed)
      }
    }

    const local = (event: { clientX: number; clientY: number }): Point => {
      const rect = frame.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }

    const startPinch = () => {
      const [a, b] = [...pointers.values()]
      if (!a || !b) return
      pinch = {
        distance: Math.max(distance(a, b), 1),
        start: current,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      pointers.set(event.pointerId, local(event))
      moved = false
      if (pointers.size === 2) startPinch()
    }

    const onPointerMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId)
      if (!previous) return
      const point = local(event)
      pointers.set(event.pointerId, point)
      if (distance(previous, point) > 2) moved = true

      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()]
        if (!a || !b) return
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const nextScale = Math.min(
          Math.max(pinch.start.scale * (distance(a, b) / pinch.distance), 1),
          maxScale,
        )
        const zoomed = zoomAround(pinch.start, pinch.mid, nextScale)
        // 2 本の指の中点が動いた分だけ移動する
        apply(
          { ...zoomed, x: zoomed.x + (mid.x - pinch.mid.x), y: zoomed.y + (mid.y - pinch.mid.y) },
          false,
        )
        event.preventDefault()
        return
      }

      if (pointers.size === 1 && current.scale > 1) {
        apply(
          {
            ...current,
            x: current.x + (point.x - previous.x),
            y: current.y + (point.y - previous.y),
          },
          false,
        )
        event.preventDefault()
      }
    }

    const onPointerEnd = (event: PointerEvent) => {
      const wasPinching = pinch !== null
      const point = pointers.get(event.pointerId)
      pointers.delete(event.pointerId)
      if (pointers.size < 2) pinch = null
      if (pointers.size === 1 && wasPinching) {
        // 指が 1 本残ったときは、そこから移動を続ける
        moved = true
        return
      }
      if (pointers.size > 0 || !point || event.type === 'pointercancel') return

      if (!moved) {
        const now = event.timeStamp
        if (
          lastTap &&
          now - lastTap.time < DOUBLE_TAP_MS &&
          distance(lastTap.point, point) < DOUBLE_TAP_DISTANCE
        ) {
          lastTap = null
          if (current.scale > 1) apply(IDENTITY, true)
          else apply(zoomAround(current, point, Math.min(doubleTapScale, maxScale)), true)
        } else {
          lastTap = { time: now, point }
        }
      }
    }

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      const nextScale = Math.min(
        Math.max(current.scale * Math.exp(-event.deltaY * 0.01), 1),
        maxScale,
      )
      apply(zoomAround(current, local(event), nextScale), false)
    }

    frame.addEventListener('pointerdown', onPointerDown)
    frame.addEventListener('pointermove', onPointerMove)
    frame.addEventListener('pointerup', onPointerEnd)
    frame.addEventListener('pointercancel', onPointerEnd)
    frame.addEventListener('wheel', onWheel, { passive: false })
    apply(IDENTITY, false)
    return () => {
      frame.removeEventListener('pointerdown', onPointerDown)
      frame.removeEventListener('pointermove', onPointerMove)
      frame.removeEventListener('pointerup', onPointerEnd)
      frame.removeEventListener('pointercancel', onPointerEnd)
      frame.removeEventListener('wheel', onWheel)
    }
  }, [maxScale, doubleTapScale, idleTouchAction])

  return (
    <div
      ref={frameRef}
      className={cn('relative select-none overflow-hidden', className)}
      style={{ touchAction: idleTouchAction }}
    >
      <div ref={contentRef} className={cn('origin-top-left', contentClassName)}>
        {children}
      </div>
    </div>
  )
}
