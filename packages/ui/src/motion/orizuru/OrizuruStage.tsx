import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ORIZURU_EXIT,
  ORIZURU_FLIGHT,
  ORIZURU_FLIGHT_SHORT,
  ORIZURU_FOLD,
  ORIZURU_FOLD_SHORT,
  ORIZURU_RETURN,
  ORIZURU_UNFOLD,
} from '../durations'
import {
  CRANE_ANCHOR,
  type CraneFacet,
  FACET_NAMES,
  morphFacets,
  poseFacets,
  TRIANGLE,
} from './crane'
import {
  exitFlight,
  type FlightPlan,
  type FlightState,
  hoverFlight,
  type Motion,
  mainFlight,
  planFlight,
  REST_STATE,
  returnFlight,
  withVelocity,
} from './flight'
import { clamp, round, seeded, segment, toMatrix3d, type Vec2 } from './math'
import {
  endScaleFor,
  type FaceId,
  FOLD_BEATS,
  faceDefs,
  foldedTriangle,
  foldFrame,
  PERSPECTIVE,
  type SheetSize,
} from './paper'
import { SheetFace, type SheetFaceProps } from './SheetFace'
import type { OrizuruOutcome, OrizuruVariant } from './use-orizuru-sequence'

export type OrizuruStageProps = {
  variant: OrizuruVariant
  outcome: OrizuruOutcome
  sheetRef: RefObject<HTMLDivElement | null>
  /** 紙に書いてある絵（芳名帳と同じもの） */
  face: SheetFaceProps
  /** 鶴が通信を待って舞っているあいだ、紙のあった場所に出す言葉 */
  waitingLabel: string
  onSettle: (result: 'departed' | 'restored') => void
}

// 鶴の SVG の表示範囲（鶴の座標）。羽ばたいた羽の先が切れないよう広めに取る
const VIEW = { x: -40, y: -50, width: 280, height: 240 }
const FLECKS = 26
const FLECK_LIFE = 0.95

type Mode = 'fold' | 'flight' | 'hover' | 'exit' | 'return' | 'unfold' | 'gone' | 'restored'

type Fleck = {
  born: number
  x: number
  y: number
  vx: number
  vy: number
  spin: number
  flip: number
  size: number
  sparkle: boolean
}

function measure(el: HTMLElement | null): { size: SheetSize; center: Vec2 } {
  const rect = el?.getBoundingClientRect()
  const width = rect?.width || 300
  const height = rect?.height || 210
  return {
    size: { width, height },
    center: [(rect?.left ?? 0) + width / 2, (rect?.top ?? 0) + height / 2],
  }
}

function viewport() {
  return {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: window.innerHeight || document.documentElement.clientHeight,
  }
}

/** 鶴の大きさ（鶴の 1 単位の px）。画面の幅に合わせ、変更の短い版は少し小さく */
function craneUnit(variant: OrizuruVariant, width: number): number {
  const span = clamp(width * 0.5, 150, 232) * (variant === 'change' ? 0.86 : 1)
  return span / 170
}

/**
 * 記帳した紙が折り鶴になって飛び立つ舞台。body に置き、画面の操作は遮らない。
 * 紙（芳名帳の絵を貼った面）は CSS の 3D 変換、鶴は SVG で描き、時間はすべてこの中で進める。
 */
export function OrizuruStage({
  variant,
  outcome,
  sheetRef,
  face,
  waitingLabel,
  onSettle,
}: OrizuruStageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const outcomeRef = useRef(outcome)
  const settleRef = useRef(onSettle)
  const [start] = useState(() => {
    const { size, center } = measure(sheetRef.current)
    const unit = craneUnit(variant, viewport().width)
    return { size, origin: center, unit, endScale: endScaleFor(size, unit) }
  })
  const defs = useMemo(() => faceDefs(start.size), [start.size])

  useEffect(() => {
    outcomeRef.current = outcome
    settleRef.current = onSettle
  })

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const { size, origin, unit, endScale } = start
    const fold = variant === 'change' ? ORIZURU_FOLD_SHORT : ORIZURU_FOLD
    const flightDuration = variant === 'change' ? ORIZURU_FLIGHT_SHORT : ORIZURU_FLIGHT
    const foldRate = FOLD_BEATS.end / fold
    const unfoldRate = FOLD_BEATS.end / ORIZURU_UNFOLD

    const groups = new Map<FaceId, HTMLElement[]>()
    for (const el of stage.querySelectorAll<HTMLElement>('[data-face]')) {
      const id = el.dataset.face as FaceId
      groups.set(id, [...(groups.get(id) ?? []), el])
    }
    const restShadow = stage.querySelector<HTMLElement>('[data-shadow="rest"]')
    const liftShadow = stage.querySelector<HTMLElement>('[data-shadow="lift"]')
    const blob = stage.querySelector<HTMLElement>('[data-shadow="blob"]')
    const crane = stage.querySelector<SVGSVGElement>('[data-crane]')
    const polygons = Array.from(stage.querySelectorAll<SVGPolygonElement>('[data-facet]'))
    const flecks = Array.from(stage.querySelectorAll<HTMLElement>('[data-fleck]'))
    const caption = stage.querySelector<HTMLElement>('[data-caption]')

    const sheetCenter = (): Vec2 => {
      const el = sheetRef.current
      if (!el) return origin
      return measure(el).center
    }
    /** 折り上がった鶴の位置と、その元になる三角（鶴の座標） */
    const restOf = (center: Vec2) => {
      const tri = foldedTriangle(size, center, endScale, origin)
      const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3
      const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3
      const nominal = (TRIANGLE[0][1] + TRIANGLE[1][1] + TRIANGLE[2][1]) / 3
      const anchor: Vec2 = [cx, cy + (CRANE_ANCHOR[1] - nominal) * unit]
      const toCrane = (p: Vec2): Vec2 => [
        CRANE_ANCHOR[0] + (p[0] - anchor[0]) / unit,
        CRANE_ANCHOR[1] + (p[1] - anchor[1]) / unit,
      ]
      return { anchor, triangle: [toCrane(tri[0]), toCrane(tri[1]), toCrane(tri[2])] as const }
    }

    // ── 描く ──
    const drawFold = (c: number) => {
      const center = sheetCenter()
      const frame = foldFrame(Math.min(c, FOLD_BEATS.halfEnd), size, center, endScale, origin)
      const states = new Map(frame.faces.map((f) => [f.id, f]))
      for (const [id, els] of groups) {
        const state = c < FOLD_BEATS.halfEnd ? states.get(id) : undefined
        for (const el of els) {
          if (!state) {
            el.style.visibility = 'hidden'
            continue
          }
          const part = el.dataset.part
          el.style.visibility = 'visible'
          el.style.transform = toMatrix3d(state.matrix)
          el.style.zIndex = String(2 + state.order * 4 + Number(el.dataset.layer ?? 0))
          if (part === 'front') el.style.opacity = state.side === 'front' ? '1' : '0'
          else if (part === 'back') el.style.opacity = state.side === 'back' ? '1' : '0'
          else if (part === 'shade') el.style.opacity = String(round(state.lighting.shade, 3))
          else if (part === 'sheen') el.style.opacity = String(round(state.lighting.sheen, 3))
        }
      }
      if (restShadow && liftShadow) {
        const m = toMatrix3d(frame.shadowMatrix)
        restShadow.style.transform = m
        liftShadow.style.transform = m
        restShadow.style.opacity = String(round(frame.restShadow, 3))
        liftShadow.style.opacity = String(round(frame.liftShadow, 3))
      }
      return frame
    }

    const drawBlob = (x: number, y: number, width: number, height: number, opacity: number) => {
      if (!blob) return
      blob.style.transform = `translate(${round(x - width / 2)}px, ${round(y - height / 2)}px) scale(${round(width / 100, 4)}, ${round(height / 100, 4)})`
      blob.style.opacity = String(round(opacity, 3))
    }

    const drawCrane = (state: FlightState | null, facets: CraneFacet[]) => {
      if (!crane) return
      if (!state) {
        crane.style.visibility = 'hidden'
        return
      }
      crane.style.visibility = 'visible'
      const ax = (CRANE_ANCHOR[0] - VIEW.x) * unit
      const ay = (CRANE_ANCHOR[1] - VIEW.y) * unit
      crane.style.transform = `translate(${round(state.x - ax)}px, ${round(state.y - ay)}px) rotate(${round(state.rotate)}deg) scale(${round(state.scale, 4)})`
      facets.forEach((facet, i) => {
        const polygon = polygons[i]
        if (!polygon) return
        polygon.setAttribute(
          'points',
          facet.points.map((p) => `${round(p[0])},${round(p[1])}`).join(' '),
        )
        polygon.setAttribute('fill', facet.fill)
        polygon.setAttribute('stroke-opacity', String(round(facet.edge, 3)))
      })
    }

    // ── 金の粒 ──
    const pool: (Fleck | null)[] = flecks.map(() => null)
    let emitted = 0
    let lastEmit = -1
    const emit = (now: number, at: Vec2, scale: number, spread: number) => {
      const slot = pool.findIndex((f) => f === null || now - f.born > FLECK_LIFE)
      if (slot < 0) return
      const i = emitted++
      const r = (salt: number) => seeded(i, salt)
      pool[slot] = {
        born: now,
        x: at[0] + (r(1) - 0.5) * spread,
        y: at[1] + (r(2) - 0.5) * spread * 0.6,
        vx: (r(3) - 0.5) * 36,
        vy: 14 + r(4) * 26,
        spin: (r(5) - 0.5) * 540,
        flip: 5 + r(6) * 9,
        size: (0.55 + r(7) * 0.75) * clamp(scale, 0.6, 1.2),
        sparkle: i % 4 === 1,
      }
    }
    const drawFlecks = (now: number) => {
      pool.forEach((f, i) => {
        const el = flecks[i]
        if (!el) return
        const age = f ? now - f.born : FLECK_LIFE
        if (!f || age >= FLECK_LIFE) {
          el.style.opacity = '0'
          return
        }
        const sway = Math.sin(age * 6 + f.flip) * 5
        const x = f.x + f.vx * age + sway
        const y = f.y + f.vy * age + 22 * age * age
        const turn = Math.cos(age * f.flip)
        const fade = segment(age, 0, 0.08) * (1 - segment(age, 0.45, FLECK_LIFE))
        // 金は光を受けて一度だけきらめく
        const glint = f.sparkle
          ? 1 + 0.9 * Math.max(0, Math.sin(Math.PI * segment(age, 0.12, 0.42)))
          : 1
        el.style.opacity = String(round(fade, 3))
        el.style.transform = `translate(${round(x)}px, ${round(y)}px) rotate(${round(f.spin * age)}deg) scale(${round(f.size * glint * Math.max(0.18, Math.abs(turn)), 3)}, ${round(f.size * glint, 3)})`
        el.dataset.kind = f.sparkle ? 'star' : 'foil'
      })
    }

    // ── 進める ──
    let mode: Mode = 'fold'
    let c = 0
    let clock = 0
    let flightT = 0
    let plan: FlightPlan | null = null
    let from: Motion | null = null
    let modeT = 0
    let current: FlightState | null = null
    let raf = 0
    let last: number | null = null
    let settled = false

    const settle = (result: 'departed' | 'restored') => {
      if (settled) return
      settled = true
      settleRef.current(result)
    }

    const currentMotion = (): Motion => {
      if (mode === 'flight' && plan) {
        const p = plan
        return withVelocity((t) => mainFlight(p, t), flightT)
      }
      if (mode === 'hover' && plan && from) {
        const p = plan
        const f = from
        return withVelocity((t) => hoverFlight(p, f, t), modeT)
      }
      return { state: current ?? REST_STATE(restOf(sheetCenter()).anchor), velocity: [0, 0] }
    }

    const advance = (dt: number) => {
      clock += dt
      const result = outcomeRef.current
      switch (mode) {
        case 'fold': {
          if (result === 'failure') {
            mode = 'unfold'
            break
          }
          c = Math.min(FOLD_BEATS.end, c + dt * foldRate)
          if (c >= FOLD_BEATS.end) {
            const rest = restOf(sheetCenter())
            plan = planFlight(rest.anchor, unit, viewport(), flightDuration)
            mode = 'flight'
            flightT = 0
          }
          break
        }
        case 'flight': {
          if (!plan) break
          if (result === 'failure') {
            from = currentMotion()
            mode = 'return'
            modeT = 0
            break
          }
          const next = flightT + dt
          if (result !== 'success' && flightT < plan.checkpoint && next >= plan.checkpoint) {
            flightT = plan.checkpoint
            from = currentMotion()
            mode = 'hover'
            modeT = 0
            break
          }
          flightT = next
          if (flightT >= plan.duration) mode = 'gone'
          break
        }
        case 'hover': {
          if (result === 'success' || result === 'failure') {
            from = currentMotion()
            mode = result === 'success' ? 'exit' : 'return'
            modeT = 0
            break
          }
          modeT += dt
          break
        }
        case 'exit': {
          modeT += dt
          if (modeT >= ORIZURU_EXIT) mode = 'gone'
          break
        }
        case 'return': {
          modeT += dt
          if (modeT >= ORIZURU_RETURN) {
            mode = 'unfold'
            c = FOLD_BEATS.end
          }
          break
        }
        case 'unfold': {
          c = Math.max(0, c - dt * unfoldRate)
          if (c <= 0) mode = 'restored'
          break
        }
        default:
          break
      }
    }

    const draw = () => {
      const center = sheetCenter()
      const rest = restOf(center)
      let blobState: {
        x: number
        y: number
        width: number
        height: number
        opacity: number
      } | null = null
      if (mode === 'fold' || mode === 'unfold' || mode === 'restored') {
        const frame = drawFold(c)
        blobState = frame.blob
        if (c >= FOLD_BEATS.halfEnd) {
          const u = segment(c, FOLD_BEATS.halfEnd, FOLD_BEATS.end)
          current = REST_STATE(rest.anchor)
          drawCrane(current, morphFacets(u, rest.triangle))
        } else {
          current = null
          drawCrane(null, [])
        }
      } else {
        drawFold(FOLD_BEATS.halfEnd)
        if (mode === 'flight' && plan) current = mainFlight(plan, flightT)
        else if (mode === 'hover' && plan && from) current = hoverFlight(plan, from, modeT)
        else if (mode === 'exit' && plan && from) current = exitFlight(plan, from, modeT)
        else if (mode === 'return' && plan && from)
          current = returnFlight(plan, rest.anchor, from, modeT)
        if (mode === 'gone') {
          current = null
          drawCrane(null, [])
        } else if (current) {
          drawCrane(current, poseFacets(current.pose))
        }
        // 鶴の影は机に残り、鶴が高く上がるほど薄く小さくなる
        const height = current ? Math.max(0, rest.anchor[1] - current.y) : 999
        const fade = 1 - clamp(height / (90 * unit), 0, 1)
        const w = 150 * unit * (0.6 + 0.4 * fade)
        blobState = {
          x: rest.anchor[0] + 8,
          y: rest.anchor[1] + 34 * unit,
          width: w,
          height: w * 0.3,
          opacity: 0.3 * fade,
        }
        // 飛んでいるあいだ、羽の後ろに金の粒が残る
        if (current && (mode === 'flight' || mode === 'exit' || mode === 'hover')) {
          const interval = mode === 'hover' ? 0.22 : 0.045
          const lifted = mode !== 'flight' || (plan !== null && flightT > plan.duration * 0.12)
          if (lifted && clock - lastEmit >= interval) {
            lastEmit = clock
            const s = current.scale * unit
            const tail: Vec2 = [current.x + 30 * s, current.y - 6 * s]
            emit(clock, tail, current.scale, 46 * s)
          }
        }
      }
      if (blobState) {
        const b = blobState
        drawBlob(b.x, b.y, b.width, b.height, b.opacity)
      }
      drawFlecks(clock)
      if (caption) {
        const show = mode === 'hover' && modeT > 0.5
        caption.style.opacity = show ? '1' : '0'
        caption.style.transform = `translate(${round(rest.anchor[0])}px, ${round(rest.anchor[1])}px) translate(-50%, -50%)`
      }
    }

    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      advance(dt)
      draw()
      if (mode === 'gone') {
        settle('departed')
        return
      }
      if (mode === 'restored') {
        settle('restored')
        return
      }
      raf = requestAnimationFrame(tick)
    }

    stage.style.perspective = `${PERSPECTIVE}px`
    stage.style.perspectiveOrigin = `${round(origin[0])}px ${round(origin[1])}px`
    draw()
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [start, variant, sheetRef])

  return createPortal(
    <div ref={stageRef} className="oz-stage" data-testid="orizuru-stage" aria-hidden="true">
      <div className="oz-shadow" data-shadow="rest" style={sizeStyle(start.size)} />
      <div className="oz-shadow oz-shadow-lift" data-shadow="lift" style={sizeStyle(start.size)} />
      <div className="oz-blob" data-shadow="blob" />
      {defs.map((def) => {
        const box = {
          width: `${def.bounds.width}px`,
          height: `${def.bounds.height}px`,
        }
        const clip = `polygon(${def.polygon
          .map((p) => `${round(p[0] - def.bounds.x)}px ${round(p[1] - def.bounds.y)}px`)
          .join(', ')})`
        const faceClip = def.id === 'sheet' ? 'inset(0 round 3px)' : clip
        return (
          <div key={def.id} className="oz-face-group">
            <div
              className="oz-face"
              data-face={def.id}
              data-part="front"
              data-layer={0}
              style={{ ...box, clipPath: faceClip }}
            >
              {def.front === 'washi' ? (
                <div
                  className="oz-face-paper wa-washi"
                  style={{
                    ...sizeStyle(start.size),
                    transform: `translate(${-def.bounds.x}px, ${-def.bounds.y}px)`,
                  }}
                >
                  <SheetFace {...face} live={false} />
                </div>
              ) : (
                <div className="oz-face-beni" />
              )}
            </div>
            <div
              className="oz-face oz-face-beni"
              data-face={def.id}
              data-part="back"
              data-layer={1}
              style={{ ...box, clipPath: faceClip }}
            />
            <div
              className="oz-face oz-face-shade"
              data-face={def.id}
              data-part="shade"
              data-layer={2}
              style={{ ...box, clipPath: faceClip }}
            />
            <div
              className="oz-face oz-face-sheen"
              data-face={def.id}
              data-part="sheen"
              data-layer={3}
              style={{ ...box, clipPath: faceClip }}
            />
          </div>
        )
      })}
      <svg
        className="oz-crane"
        data-crane=""
        viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
        width={round(VIEW.width * start.unit)}
        height={round(VIEW.height * start.unit)}
        style={{
          transformOrigin: `${round((CRANE_ANCHOR[0] - VIEW.x) * start.unit)}px ${round((CRANE_ANCHOR[1] - VIEW.y) * start.unit)}px`,
        }}
        aria-hidden="true"
        focusable="false"
      >
        <g strokeLinejoin="round" strokeWidth={0.6}>
          {FACET_NAMES.map((name) => (
            <polygon key={name} data-facet="" className="oz-facet" points="0,0 0,0 0,0" />
          ))}
        </g>
      </svg>
      {Array.from({ length: FLECKS }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 粒は数の決まった入れ物で、順番が変わらない
        <i key={i} className="oz-fleck" data-fleck="" data-kind="foil" />
      ))}
      <p className="oz-caption" data-caption="">
        {waitingLabel}
      </p>
    </div>,
    document.body,
  )
}

function sizeStyle(size: SheetSize) {
  return { width: `${size.width}px`, height: `${size.height}px` }
}
