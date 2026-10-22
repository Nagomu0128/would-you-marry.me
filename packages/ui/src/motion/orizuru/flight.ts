// 折り上がった鶴が飛ぶ道筋。座標は画面の px、鶴の基準点（CRANE_ANCHOR）の位置で表す。
// 頭は左なので、左上へ曲線を描いて上の端の外へ出る。

import { ORIZURU_EXIT, ORIZURU_FLAP, ORIZURU_RETURN } from '../durations'
import { type CranePose, flapAngle } from './crane'
import { bezier, bezierTangent, clamp, easeFold, easeIn, lerp, segment, type Vec2 } from './math'

export type FlightState = {
  x: number
  y: number
  /** 折り上がりの大きさを 1 とする */
  scale: number
  /** 画面の上での傾き（度。正で頭が上がる） */
  rotate: number
  pose: CranePose
  /** 羽ばたきの位相（羽ばたきを途切れさせずに次の動きへ渡す） */
  phase: number
}

export type FlightPlan = {
  rest: Vec2
  path: [Vec2, Vec2, Vec2, Vec2]
  exitY: number
  /** 飛び立ってから画面の外へ出るまで（秒） */
  duration: number
  /** ここまでに通信が終わっていなければ、画面の上で舞って待つ（秒） */
  checkpoint: number
  hoverY: number
  viewport: { width: number; height: number }
  /** 鶴の 1 単位の px */
  unit: number
}

/** 飛び立つ前の溜め（全体に対する割合） */
const CROUCH = 0.1
const FLAP_PERIOD = ORIZURU_FLAP
const EXIT_SCALE = 0.42
/** 舞っている鶴が上へ行きすぎないよう、勢いを殺す時間（秒） */
const HOVER_BRAKE = 0.14

export function planFlight(
  rest: Vec2,
  unit: number,
  viewport: { width: number; height: number },
  duration: number,
): FlightPlan {
  const { width, height } = viewport
  const craneHeight = 130 * unit
  const exitY = -craneHeight * EXIT_SCALE * 0.75 - 28
  const dy = rest[1] - exitY
  const exitX = clamp(rest[0] - width * 0.3, width * 0.14, width * 0.86)
  const path: [Vec2, Vec2, Vec2, Vec2] = [
    rest,
    [rest[0] - width * 0.08, rest[1] - dy * 0.32],
    [lerp(rest[0], exitX, 0.72), rest[1] - dy * 0.78],
    [exitX, exitY],
  ]
  const hoverY = Math.max(height * 0.14, craneHeight * 0.36 + 24)
  const plan: FlightPlan = {
    rest,
    path,
    exitY,
    duration,
    checkpoint: duration,
    hoverY,
    viewport,
    unit,
  }
  return { ...plan, checkpoint: findCheckpoint(plan) }
}

/** 道筋の進み具合（飛び立ちはゆっくり、だんだん速く） */
function progress(plan: FlightPlan, f: number): number {
  const t = segment(f, plan.duration * CROUCH, plan.duration)
  return t ** 1.55
}

function flapPhase(plan: FlightPlan, f: number): number {
  return Math.max(0, f - plan.duration * CROUCH) / FLAP_PERIOD
}

/** 進む向きから、頭の上がり方を決める（向きに合わせきらず、少しだけ傾ける） */
function climbRotate(tangent: Vec2): number {
  const climb = Math.atan2(-tangent[1], -tangent[0]) * (180 / Math.PI)
  return clamp(climb * 0.42, -10, 32)
}

export function mainFlight(plan: FlightPlan, f: number): FlightState {
  const [p0, p1, p2, p3] = plan.path
  const s = progress(plan, f)
  const [x, y] = bezier(p0, p1, p2, p3, s)
  const tangent = bezierTangent(p0, p1, p2, p3, Math.max(s, 0.02))
  const crouch = segment(f, 0, plan.duration * CROUCH)
  // 溜め: 少し沈んで羽を上げ、最初の打ち下ろしで浮く
  const dip = Math.sin(Math.PI * crouch) * 5 * plan.unit * (1 - s)
  const phase = flapPhase(plan, f)
  const lifted = f > plan.duration * CROUCH
  const wing = lifted ? flapAngle(phase) : -0.22 * Math.sin((Math.PI / 2) * crouch)
  const scale = lerp(1, EXIT_SCALE, easeIn(s))
  return {
    x,
    y: y + dip,
    scale,
    rotate: climbRotate(tangent) * segment(s, 0, 0.18),
    pose: { wing, bank: 0.28 * Math.sin(Math.PI * s), pitch: -0.32 * s },
    phase,
  }
}

function findCheckpoint(plan: FlightPlan): number {
  // 勢いを殺したあとの高さが hoverY になるところ
  const settleY = (f: number) => {
    const a = mainFlight(plan, f)
    const b = mainFlight(plan, f + 0.01)
    return a.y + ((b.y - a.y) / 0.01) * HOVER_BRAKE
  }
  let lo = plan.duration * CROUCH
  let hi = plan.duration
  if (settleY(hi) > plan.hoverY) return plan.duration
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (settleY(mid) > plan.hoverY) lo = mid
    else hi = mid
  }
  return hi
}

export type Motion = { state: FlightState; velocity: Vec2 }

/** 状態とその速度（px/秒）。次の動きへ滑らかに渡すために使う */
export function withVelocity(at: (t: number) => FlightState, t: number): Motion {
  const a = at(t)
  const b = at(t + 0.008)
  return { state: a, velocity: [(b.x - a.x) / 0.008, (b.y - a.y) / 0.008] }
}

/**
 * 通信を待つあいだ、画面の上でゆっくり八の字を描いて舞う。
 * tau は舞い始めてからの秒数。from は舞い始めた瞬間の状態。
 */
export function hoverFlight(plan: FlightPlan, from: Motion, tau: number): FlightState {
  const { width } = plan.viewport
  const brake = 1 - Math.exp(-tau / HOVER_BRAKE)
  const ease = easeFold(segment(tau, 0, 0.9))
  const ax = Math.min(width * 0.12, 46)
  const ay = 10 * plan.unit
  const w = (2 * Math.PI) / 3.4
  const loopX = -ax * Math.sin(w * tau)
  const loopY = (-ay * Math.sin(2 * w * tau)) / 2
  // 羽ばたいては滑る。羽ばたきの間隔を広げる
  const phase = from.state.phase + tau / (FLAP_PERIOD * 2.1)
  return {
    x: from.state.x + from.velocity[0] * HOVER_BRAKE * brake + loopX * ease,
    y: from.state.y + from.velocity[1] * HOVER_BRAKE * brake + loopY * ease,
    scale: from.state.scale,
    rotate: lerp(from.state.rotate, 6 + 4 * Math.cos(w * tau), ease),
    pose: {
      wing: flapAngle(phase, lerp(1.65, 1.15, ease)),
      bank: lerp(from.state.pose.bank, 0.22 * Math.cos(w * tau), ease),
      pitch: lerp(from.state.pose.pitch, -0.12, ease),
    },
    phase,
  }
}

const EXIT_DURATION = ORIZURU_EXIT

/** 舞っていた鶴が、通信が終わってから上の端の外へ出る */
export function exitFlight(plan: FlightPlan, from: Motion, e: number): FlightState {
  const { width } = plan.viewport
  const start: Vec2 = [from.state.x, from.state.y]
  const exitX = clamp(start[0] - width * 0.16, width * 0.1, width * 0.9)
  const path: [Vec2, Vec2, Vec2, Vec2] = [
    start,
    [start[0] + from.velocity[0] * 0.12, start[1] + from.velocity[1] * 0.12 - 30],
    [lerp(start[0], exitX, 0.6), lerp(start[1], plan.exitY, 0.55)],
    [exitX, plan.exitY],
  ]
  const s = easeIn(segment(e, 0, EXIT_DURATION))
  const [x, y] = bezier(...path, s)
  const phase = from.state.phase + e / FLAP_PERIOD
  return {
    x,
    y,
    scale: lerp(from.state.scale, EXIT_SCALE, s),
    rotate: lerp(from.state.rotate, climbRotate(bezierTangent(...path, Math.max(s, 0.05))), s),
    pose: {
      wing: flapAngle(phase),
      bank: lerp(from.state.pose.bank, 0.25, s),
      pitch: lerp(from.state.pose.pitch, -0.3, s),
    },
    phase,
  }
}

const RETURN_DURATION = ORIZURU_RETURN

/** 送信に失敗したとき、鶴が紙のあった場所へ降りてくる */
export function returnFlight(plan: FlightPlan, rest: Vec2, from: Motion, r: number): FlightState {
  const start: Vec2 = [from.state.x, from.state.y]
  const t = easeFold(segment(r, 0, RETURN_DURATION))
  const path: [Vec2, Vec2, Vec2, Vec2] = [
    start,
    [start[0] + from.velocity[0] * 0.08, start[1] + from.velocity[1] * 0.08 - 10],
    [rest[0], rest[1] - 70 * plan.unit],
    rest,
  ]
  const [x, y] = bezier(...path, t)
  // 羽ばたきを弱めながら、最後は折り上がりの姿に戻る
  const phase = from.state.phase + r / (FLAP_PERIOD * 1.3)
  const calm = 1 - t
  return {
    x,
    y,
    scale: lerp(from.state.scale, 1, t),
    rotate: lerp(from.state.rotate, 0, t),
    pose: {
      wing: flapAngle(phase, 1.3) * calm,
      bank: from.state.pose.bank * calm,
      pitch: from.state.pose.pitch * calm,
    },
    phase,
  }
}

export const REST_STATE = (rest: Vec2): FlightState => ({
  x: rest[0],
  y: rest[1],
  scale: 1,
  rotate: 0,
  pose: { wing: 0, bank: 0, pitch: 0 },
  phase: 0,
})
