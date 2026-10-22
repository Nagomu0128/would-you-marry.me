// 三角に折った紅の紙が鶴になり、羽ばたく。座標は ORIZURU_VIEWBOX（200 × 130、頭は左）の単位。
// 折り上がりの形は ORIZURU_FACETS と一致する。

import { ORIZURU_FACETS, type OrizuruFacetShade } from '../../ornaments/Orizuru'
import { lightFor } from './light'
import {
  apply,
  clamp,
  compose,
  cross,
  easeFold,
  easeOutBack,
  hexToRgb,
  lerp,
  lerp2,
  type Mat4,
  mixRgb,
  normalize,
  type Rgb,
  rgbToCss,
  rotation,
  rotationAbout,
  segment,
  translation,
  type Vec2,
  type Vec3,
} from './math'

export type FacetName =
  | 'wing-back'
  | 'tail-front'
  | 'tail-back'
  | 'neck-front'
  | 'neck-back'
  | 'head'
  | 'body-top'
  | 'body-bottom'
  | 'wing-front'
  | 'wing-front-fold'

type Tri = readonly [Vec2, Vec2, Vec2]

/** 紅の紙の色（ornaments.css の tone="beni" と同じ）。mid は --color-accent */
export const BENI: Record<OrizuruFacetShade, string> = {
  light: '#c9343f',
  mid: '#a8232e',
  shade: '#8a1c26',
  deep: '#6e1520',
}
const INK: Rgb = hexToRgb('#2a201c')
const SHEEN: Rgb = hexToRgb('#fff6ea')

/** 鶴を回すときの中心と、画面に置くときの基準点 */
export const CRANE_ANCHOR: Vec2 = [100, 90]

function parse(points: string): Tri {
  const [a, b, c] = points.split(' ').map((pair) => {
    const [x, y] = pair.split(',').map(Number)
    return [x ?? 0, y ?? 0] as Vec2
  })
  return [a ?? [0, 0], b ?? [0, 0], c ?? [0, 0]]
}

export const FACET_NAMES = ORIZURU_FACETS.map((facet) => facet.name as FacetName)
const FINAL = new Map(ORIZURU_FACETS.map((f) => [f.name as FacetName, parse(f.points)]))
const FINAL_SHADE = new Map(ORIZURU_FACETS.map((f) => [f.name as FacetName, f.shade]))

function finalOf(name: FacetName): Tri {
  return (
    FINAL.get(name) ?? [
      [0, 0],
      [0, 0],
      [0, 0],
    ]
  )
}

// ── 折り上がるまでの形 ─────────────────────────────────────────────

/** 半分に折った三角（底辺 96、高さ 48）。実際の三角はこれに重ねて写す */
export const TRIANGLE: Tri = [
  [52, 96],
  [148, 96],
  [100, 48],
]

type Keyframe = Record<FacetName, Tri>

// K0: 半分に折った三角。すべての面が三角の中に重なっていて、同じ紅の一枚に見える
const K0: Keyframe = {
  'wing-back': [
    [76, 72],
    [100, 52],
    [124, 72],
  ],
  'tail-front': [
    [102, 88],
    [110, 90],
    [101, 96],
  ],
  'tail-back': [
    [102, 88],
    [101, 96],
    [104, 86],
  ],
  'neck-front': [
    [98, 88],
    [90, 90],
    [99, 96],
  ],
  'neck-back': [
    [98, 88],
    [99, 96],
    [96, 86],
  ],
  head: [
    [99, 96],
    [99, 96],
    [99, 96],
  ],
  'body-top': [
    [52, 96],
    [100, 48],
    [148, 96],
  ],
  'body-bottom': [
    [52, 96],
    [148, 96],
    [100, 96],
  ],
  'wing-front': [
    [64, 90],
    [100, 52],
    [136, 90],
  ],
  'wing-front-fold': [
    [100, 90],
    [136, 90],
    [118, 93],
  ],
}

// K1: 正方基本形（ひし形）。上半分が羽、下半分が胴になる
const K1: Keyframe = {
  'wing-back': [
    [72, 66],
    [100, 30],
    [128, 66],
  ],
  'tail-front': [
    [102, 70],
    [110, 68],
    [101, 104],
  ],
  'tail-back': [
    [102, 70],
    [101, 104],
    [104, 67],
  ],
  'neck-front': [
    [98, 70],
    [90, 68],
    [99, 104],
  ],
  'neck-back': [
    [98, 70],
    [99, 104],
    [96, 67],
  ],
  head: [
    [99, 104],
    [99, 104],
    [99, 104],
  ],
  'body-top': [
    [66, 66],
    [100, 60],
    [134, 66],
  ],
  'body-bottom': [
    [66, 66],
    [134, 66],
    [100, 108],
  ],
  'wing-front': [
    [66, 66],
    [100, 26],
    [134, 66],
  ],
  'wing-front-fold': [
    [100, 66],
    [134, 66],
    [112, 76],
  ],
}

// K2: 鶴の基本形（細長いひし形）。下の二本の脚が首と尾になる
const K2: Keyframe = {
  'wing-back': [
    [90, 74],
    [99, 14],
    [110, 74],
  ],
  'tail-front': [
    [104, 80],
    [112, 76],
    [102, 126],
  ],
  'tail-back': [
    [104, 80],
    [102, 126],
    [106, 75],
  ],
  'neck-front': [
    [96, 80],
    [88, 76],
    [98, 126],
  ],
  'neck-back': [
    [96, 80],
    [98, 126],
    [94, 75],
  ],
  head: [
    [98, 126],
    [98, 126],
    [98, 126],
  ],
  'body-top': [
    [86, 74],
    [100, 66],
    [114, 74],
  ],
  'body-bottom': [
    [86, 74],
    [114, 74],
    [100, 98],
  ],
  'wing-front': [
    [86, 74],
    [100, 10],
    [114, 74],
  ],
  'wing-front-fold': [
    [100, 74],
    [114, 74],
    [106, 84],
  ],
}

const K1_SHADE: Record<FacetName, OrizuruFacetShade> = {
  'wing-back': 'mid',
  'tail-front': 'mid',
  'tail-back': 'mid',
  'neck-front': 'mid',
  'neck-back': 'mid',
  head: 'deep',
  'body-top': 'mid',
  'body-bottom': 'shade',
  'wing-front': 'light',
  'wing-front-fold': 'deep',
}
const K2_SHADE: Record<FacetName, OrizuruFacetShade> = {
  ...K1_SHADE,
  'tail-front': 'shade',
  'neck-front': 'shade',
  'tail-back': 'deep',
  'neck-back': 'deep',
}

// 首と尾は、付け根を中心に下から外へ回って折り上がる（中割り折り）
const NECK_PIVOT: [Vec2, Vec2] = [
  [96, 80],
  [88, 94],
]
const TAIL_PIVOT: [Vec2, Vec2] = [
  [104, 80],
  [112, 92],
]

function angleOf(v: Vec2): number {
  return Math.atan2(v[1], v[0])
}

/** from から to への回転角を、指定した向き（+1 は時計回り）で求める */
function sweep(from: number, to: number, direction: 1 | -1): number {
  let d = to - from
  while (direction > 0 && d < 0) d += 2 * Math.PI
  while (direction < 0 && d > 0) d -= 2 * Math.PI
  return d
}

function rotate2(v: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]
}

const NECK_TURN = sweep(
  angleOf([K2['neck-front'][2][0] - NECK_PIVOT[0][0], K2['neck-front'][2][1] - NECK_PIVOT[0][1]]),
  angleOf([
    finalOf('neck-front')[2][0] - NECK_PIVOT[1][0],
    finalOf('neck-front')[2][1] - NECK_PIVOT[1][1],
  ]),
  1,
)
const TAIL_TURN = sweep(
  angleOf([K2['tail-front'][2][0] - TAIL_PIVOT[0][0], K2['tail-front'][2][1] - TAIL_PIVOT[0][1]]),
  angleOf([
    finalOf('tail-front')[2][0] - TAIL_PIVOT[1][0],
    finalOf('tail-front')[2][1] - TAIL_PIVOT[1][1],
  ]),
  -1,
)

function mapTri(t: Tri, f: (p: Vec2, i: 0 | 1 | 2) => Vec2): Tri {
  return [f(t[0], 0), f(t[1], 1), f(t[2], 2)]
}

/** 付け根のまわりに回しながら、形を K2 から最終形へ移す */
function swing(from: Tri, to: Tri, pivots: [Vec2, Vec2], turn: number, t: number): Tri {
  const pivot = lerp2(pivots[0], pivots[1], t)
  return mapTri(from, (p, i) => {
    const q = to[i]
    const a: Vec2 = [p[0] - pivots[0][0], p[1] - pivots[0][1]]
    const b = rotate2([q[0] - pivots[1][0], q[1] - pivots[1][1]], -turn)
    const r = rotate2(lerp2(a, b, t), turn * t)
    return [pivot[0] + r[0], pivot[1] + r[1]]
  })
}

function mixTri(a: Tri, b: Tri, t: number): Tri {
  return [lerp2(a[0], b[0], t), lerp2(a[1], b[1], t), lerp2(a[2], b[2], t)]
}

/** 三角形の重心座標で、名目の三角 TRIANGLE の中の点を実際の三角に写す */
function barycentric(p: Vec2, [a, b, c]: Tri): Vec3 {
  const v0: Vec2 = [b[0] - a[0], b[1] - a[1]]
  const v1: Vec2 = [c[0] - a[0], c[1] - a[1]]
  const v2: Vec2 = [p[0] - a[0], p[1] - a[1]]
  const d00 = v0[0] * v0[0] + v0[1] * v0[1]
  const d01 = v0[0] * v1[0] + v0[1] * v1[1]
  const d11 = v1[0] * v1[0] + v1[1] * v1[1]
  const d20 = v2[0] * v0[0] + v2[1] * v0[1]
  const d21 = v2[0] * v1[0] + v2[1] * v1[1]
  const denom = d00 * d11 - d01 * d01 || 1
  const v = (d11 * d20 - d01 * d21) / denom
  const w = (d00 * d21 - d01 * d20) / denom
  return [1 - v - w, v, w]
}

function fromBarycentric([u, v, w]: Vec3, [a, b, c]: Tri): Vec2 {
  return [u * a[0] + v * b[0] + w * c[0], u * a[1] + v * b[1] + w * c[1]]
}

const K0_BARY = new Map(
  FACET_NAMES.map((name) => [name, K0[name].map((p) => barycentric(p, TRIANGLE))] as const),
)

export type CraneFacet = {
  name: FacetName
  points: Tri
  fill: string
  /** 金の折り目の線の濃さ（0〜1） */
  edge: number
}

function shadeColor(shade: OrizuruFacetShade): Rgb {
  return hexToRgb(BENI[shade])
}

/**
 * 三角から鶴へ（FOLD_BEATS.halfEnd 〜 end）。
 * u は 0〜1、triangle は実際に見えている三角（鶴の座標）。
 */
export function morphFacets(u: number, triangle: Tri): CraneFacet[] {
  // 拍: 正方基本形 0〜0.26、鶴の基本形 0.26〜0.53、首・尾・羽・頭 0.53〜1
  const a = easeFold(segment(u, 0, 0.26))
  const b = easeFold(segment(u, 0.26, 0.53))
  const wings = easeOutBack(segment(u, 0.5, 0.9), 1.6)
  const legs = easeOutBack(segment(u, 0.56, 1), 1.2)
  const head = easeOutBack(segment(u, 0.78, 1), 2)
  const edge = clamp(0.6 * a + 0.25 * b + 0.15 * segment(u, 0.53, 1), 0, 1)

  return FACET_NAMES.map((name) => {
    const bary = K0_BARY.get(name)
    const k0: Tri = bary
      ? [
          fromBarycentric(bary[0] ?? [1, 0, 0], triangle),
          fromBarycentric(bary[1] ?? [1, 0, 0], triangle),
          fromBarycentric(bary[2] ?? [1, 0, 0], triangle),
        ]
      : K0[name]
    let points = mixTri(mixTri(k0, K1[name], a), K2[name], b)
    const final = finalOf(name)
    if (name === 'neck-front' || name === 'neck-back') {
      points = swing(points, final, NECK_PIVOT, NECK_TURN, legs)
    } else if (name === 'tail-front' || name === 'tail-back') {
      points = swing(points, final, TAIL_PIVOT, TAIL_TURN, legs)
    } else if (name === 'head') {
      // 頭は首の先について回り、最後に折り下げる
      const tip = swing(K2['neck-front'], finalOf('neck-front'), NECK_PIVOT, NECK_TURN, legs)[2]
      const neckTip = finalOf('neck-front')[2]
      const turn = NECK_TURN * (legs - 1)
      points = mapTri(final, (p) => {
        const offset = rotate2([p[0] - neckTip[0], p[1] - neckTip[1]], turn)
        return [tip[0] + offset[0] * head, tip[1] + offset[1] * head]
      })
    } else {
      points = mixTri(points, final, name.startsWith('wing') ? wings : legs)
    }

    const base = mixRgb(
      mixRgb(
        mixRgb(shadeColor('mid'), shadeColor(K1_SHADE[name]), a),
        shadeColor(K2_SHADE[name]),
        b,
      ),
      shadeColor(FINAL_SHADE.get(name) ?? 'mid'),
      clamp(name.startsWith('wing') ? wings : legs, 0, 1),
    )
    return { name, points, fill: rgbToCss(base), edge }
  })
}

// ── 飛ぶ鶴（立体） ────────────────────────────────────────────────

/** 羽の先の奥行き（手前の羽は +z、奥の羽は -z） */
const WING_DEPTH = 34
type Wing = { name: 'wing-back' | 'wing-front'; root: [Vec3, Vec3]; tip: Vec3; direction: 1 | -1 }

function wingOf(name: 'wing-back' | 'wing-front', depth: number): Wing {
  const [r1, tip, r2] = finalOf(name)
  const root: [Vec3, Vec3] = [
    [r1[0], r1[1], 0],
    [r2[0], r2[1], 0],
  ]
  const tip3: Vec3 = [tip[0], tip[1], depth]
  // 小さく回したときに羽の先が外へ開く向き
  const probe = apply(rotationAbout(root[0], sub(root[1], root[0]), 0.1), tip3)
  const direction = Math.abs(probe[2]) > Math.abs(depth) ? 1 : -1
  return { name, root, tip: tip3, direction }
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function negate(v: Vec3): Vec3 {
  return [-v[0], -v[1], -v[2]]
}

const WINGS = [wingOf('wing-back', -WING_DEPTH), wingOf('wing-front', WING_DEPTH)]

export type CranePose = {
  /** 羽を打ち下ろした角度（ラジアン。0 は折り上がりの姿、正で下へ） */
  wing: number
  /** 体の傾き（前後の軸まわり、ラジアン） */
  bank: number
  /** 見る角度（左右の軸まわり、ラジアン。正で背中が見える） */
  pitch: number
}

export const REST_POSE: CranePose = { wing: 0, bank: 0, pitch: 0 }

const WEAK_PERSPECTIVE = 520

function facetVertices(name: FacetName, pose: CranePose): [Vec3, Vec3, Vec3] {
  const [a, b, c] = finalOf(name)
  const wing = WINGS.find((w) => w.name === name)
  if (!wing) {
    return [
      [a[0], a[1], 0],
      [b[0], b[1], 0],
      [c[0], c[1], 0],
    ]
  }
  const flap = rotationAbout(
    wing.root[0],
    sub(wing.root[1], wing.root[0]),
    pose.wing * wing.direction,
  )
  return [wing.root[0], apply(flap, wing.tip), wing.root[1]]
}

function bodyMatrix(pose: CranePose): Mat4 {
  const [cx, cy] = CRANE_ANCHOR
  return compose(
    translation(cx, cy, 0),
    rotation([1, 0, 0], pose.pitch),
    rotation([1, 0.12, 0], pose.bank),
    translation(-cx, -cy, 0),
  )
}

function normalOf([a, b, c]: [Vec3, Vec3, Vec3]): Vec3 {
  return normalize(cross(sub(b, a), sub(c, a)))
}

const REST_NORMALS = new Map(
  FACET_NAMES.map((name) => [name, normalOf(facetVertices(name, REST_POSE))] as const),
)

/** 姿勢から、奥から順に並べた面を返す。折り上がりの姿（REST_POSE）では ORIZURU_FACETS と同じ形・色 */
export function poseFacets(pose: CranePose): CraneFacet[] {
  const body = bodyMatrix(pose)
  const [cx, cy] = CRANE_ANCHOR
  const facets = FACET_NAMES.map((name, index) => {
    const local = facetVertices(name, pose)
    const world: [Vec3, Vec3, Vec3] = [
      apply(body, local[0]),
      apply(body, local[1]),
      apply(body, local[2]),
    ]
    const toScreen = (p: Vec3): Vec2 => {
      const f = WEAK_PERSPECTIVE / (WEAK_PERSPECTIVE - p[2])
      return [cx + (p[0] - cx) * f, cy + (p[1] - cy) * f]
    }
    const points: Tri = [toScreen(world[0]), toScreen(world[1]), toScreen(world[2])]
    // 折り上がりの姿で手前を向いていた側の法線。z が負なら、いまは裏が見えている
    const rest = REST_NORMALS.get(name) ?? [0, 0, 1]
    const now = normalOf(world)
    const side: Vec3 = rest[2] >= 0 ? now : negate(now)
    const flipped = side[2] < 0
    const restLight = lightFor(rest[2] >= 0 ? rest : negate(rest))
    const nowLight = lightFor(flipped ? negate(side) : side)
    const shadeName = FINAL_SHADE.get(name) ?? 'mid'
    let color = shadeColor(flipped ? (shadeName === 'light' ? 'shade' : 'deep') : shadeName)
    const darker = nowLight.shade - restLight.shade
    const brighter = nowLight.sheen - restLight.sheen
    if (darker > 0) color = mixRgb(color, INK, clamp(darker * 0.9, 0, 0.55))
    if (brighter > 0) color = mixRgb(color, SHEEN, clamp(brighter * 0.5, 0, 0.35))
    const depth = world.reduce((sum, p) => sum + p[2], 0) / 3
    return { facet: { name, points, fill: rgbToCss(color), edge: 1 }, depth, index }
  })
  facets.sort((x, y) => x.depth - y.depth || x.index - y.index)
  return facets.map((f) => f.facet)
}

/** 羽ばたき 1 回分の羽の角度。phase は 0〜1（0 で上、打ち下ろしは速く、打ち上げはゆっくり） */
export function flapAngle(phase: number, amplitude = 1.65): number {
  const p = phase - Math.floor(phase)
  const warped = p < 0.42 ? (p / 0.42) * 0.5 : 0.5 + ((p - 0.42) / 0.58) * 0.5
  return (
    amplitude * 0.5 * (1 - Math.cos(2 * Math.PI * warped)) - 0.12 * Math.sin(2 * Math.PI * warped)
  )
}

export function lerpPose(a: CranePose, b: CranePose, t: number): CranePose {
  return {
    wing: lerp(a.wing, b.wing, t),
    bank: lerp(a.bank, b.bank, t),
    pitch: lerp(a.pitch, b.pitch, t),
  }
}
