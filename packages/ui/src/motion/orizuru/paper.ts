// 芳名帳の紙を折る（紙が持ち上がり、正方形に整い、三角に二度折られる）。
// 紙の座標は芳名帳の左上を原点とする px。表（芳名を書いた面）は生成りの和紙、裏は紅。
// 時刻 c は標準の長さ（ORIZURU_FOLD 秒）の中の秒数。短い版は時間を縮めて同じ拍で折る。

import { type Lighting, lightFor } from './light'
import {
  apply,
  applyDirection,
  bump,
  compose,
  easeFold,
  easeWa,
  lerp,
  lerp2,
  type Mat4,
  normalize,
  project,
  rotation,
  rotationAbout,
  scaling,
  segment,
  signedArea,
  translation,
  type Vec2,
  type Vec3,
} from './math'

/** 折りの拍（標準の長さの中の秒） */
export const FOLD_BEATS = {
  /** 紙が持ち上がる */
  liftEnd: 0.3,
  /** 左の余りを裏へ折り、正方形に整える */
  squareStart: 0.22,
  squareEnd: 0.48,
  /** 対角線で三角に折る */
  diagonalEnd: 0.8,
  /** さらに半分に折る。ここで紙（DOM）から鶴（SVG）に替わる */
  halfEnd: 1.02,
  /** 正方基本形 → 鶴の基本形 → 首と尾を折り上げ、羽を広げる */
  baseEnd: 1.12,
  birdEnd: 1.22,
  end: 1.4,
} as const

/** 舞台の perspective（px）。CSS と JS の投影で同じ値を使う */
export const PERSPECTIVE = 1100
/** 持ち上がった紙の高さ（px） */
export const LIFT_HEIGHT = 34
/** 芳名帳の紙の縦横比（幅 / 高さ）。左の 3 割を裏へ折ると正方形になる */
export const SHEET_RATIO = 360 / 252

export type SheetSize = { width: number; height: number }
export type Material = 'washi' | 'beni'
export type FaceId = 'sheet' | 'strip' | 'square' | 'lower' | 'flap' | 'right' | 'left'

export type FaceDef = {
  id: FaceId
  /** 紙の座標の多角形 */
  polygon: readonly Vec2[]
  /** 外接する矩形（要素の大きさ） */
  bounds: { x: number; y: number; width: number; height: number }
  /** 手前を向いているときの素材。'right'・'left' は紅の面が重なった状態なので両面とも紅 */
  front: Material
}

/** 紙の要所（正方形の四隅と中心）。x0 は正方形の左端 */
export function paperPoints({ width, height }: SheetSize) {
  const x0 = width - height
  return {
    x0,
    TL: [x0, 0] as Vec2,
    TR: [width, 0] as Vec2,
    BR: [width, height] as Vec2,
    BL: [x0, height] as Vec2,
    mid: [x0 + height / 2, height / 2] as Vec2,
  }
}

function boundsOf(polygon: readonly Vec2[]) {
  const xs = polygon.map((p) => p[0])
  const ys = polygon.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

export function faceDefs(size: SheetSize): FaceDef[] {
  const { width, height } = size
  const { x0, TL, TR, BR, BL, mid } = paperPoints(size)
  const defs: [FaceId, Vec2[], Material][] = [
    [
      'sheet',
      [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ],
      'washi',
    ],
    [
      'strip',
      [
        [0, 0],
        [x0, 0],
        [x0, height],
        [0, height],
      ],
      'washi',
    ],
    ['square', [TL, TR, BR, BL], 'washi'],
    ['lower', [TL, BR, BL], 'washi'],
    ['flap', [TL, TR, BR], 'washi'],
    ['right', [BL, mid, BR], 'beni'],
    ['left', [TL, mid, BL], 'beni'],
  ]
  return defs.map(([id, polygon, front]) => ({ id, polygon, bounds: boundsOf(polygon), front }))
}

export type FaceState = {
  id: FaceId
  /** 要素（外接矩形の左上が原点）から舞台への行列 */
  matrix: Mat4
  /** 手前に見えている面 */
  side: 'front' | 'back'
  lighting: Lighting
  /** 重なり順（大きいほど手前） */
  order: number
}

export type FoldFrame = {
  faces: FaceState[]
  /** 置いてあった紙の影（休んでいる紙）と、持ち上がった紙の影の濃さ */
  restShadow: number
  liftShadow: number
  /** 影の要素（紙の大きさ）の 2D の行列 */
  shadowMatrix: Mat4
  /** 折っている紙の下の、柔らかい丸い影 */
  blob: { x: number; y: number; width: number; height: number; opacity: number }
}

type Root = { matrix: Mat4; flat: Mat4; lift: number; scale: number; pivot: Vec2; target: Vec2 }

/** 鶴の大きさ（crane の 1 単位が何 px か）から、折り終わりの紙の縮尺を決める */
export function endScaleFor(size: SheetSize, craneUnit: number): number {
  const magnify = PERSPECTIVE / (PERSPECTIVE - LIFT_HEIGHT)
  // 半分に折った三角の底辺（紙の高さ）が、鶴の座標で 96 になる
  return (96 * craneUnit) / (size.height * magnify)
}

function rootAt(c: number, size: SheetSize, center: Vec2, endScale: number): Root {
  const { width, height } = size
  const { x0 } = paperPoints(size)
  const B = FOLD_BEATS
  const lift = easeWa(segment(c, 0, B.liftEnd))
  const settle = easeFold(segment(c, 0.46, B.halfEnd))
  const rx = (9 * Math.PI) / 180
  const ry = (-7 * Math.PI) / 180
  const tiltX = rx * lift * (1 - settle)
  const tiltY = ry * lift * (1 - settle)
  const spin = ((-3.5 * Math.PI) / 180) * bump(segment(c, B.liftEnd, B.halfEnd))
  const shrink = easeFold(segment(c, 0.26, B.halfEnd))
  // 三角に折り終えたところで、指で折り目を押さえる
  const press = 1 - 0.018 * bump(segment(c, B.diagonalEnd - 0.02, B.diagonalEnd + 0.1))
  const scale = lerp(1, endScale, shrink) * press

  // 見えている形の中心が、いつも同じところに来るように基準点を移す
  const sheetCenter: Vec2 = [width / 2, height / 2]
  const squareCenter: Vec2 = [x0 + height / 2, height / 2]
  const lowerCentroid: Vec2 = [x0 + height / 3, (2 * height) / 3]
  const halfCentroid: Vec2 = [x0 + height / 2, (5 * height) / 6]
  let pivot = lerp2(sheetCenter, squareCenter, easeFold(segment(c, B.squareStart, B.squareEnd)))
  pivot = lerp2(pivot, lowerCentroid, easeFold(segment(c, B.squareEnd, B.diagonalEnd)))
  pivot = lerp2(pivot, halfCentroid, easeFold(segment(c, B.diagonalEnd, B.halfEnd)))
  const rise = 16 * easeWa(segment(c, B.liftEnd, B.halfEnd))
  const target: Vec2 = [center[0], center[1] - rise]
  const z = LIFT_HEIGHT * lift

  const matrix = compose(
    translation(target[0], target[1], z),
    rotation([0, 0, 1], spin),
    rotation([1, 0, 0], tiltX),
    rotation([0, 1, 0], tiltY),
    scaling(scale),
    translation(-pivot[0], -pivot[1], 0),
  )
  // 影は机の上（z = 0）に落ちる。紙が高いほど右下にずれる
  const flat = compose(
    translation(target[0] + 5 * lift, target[1] + 12 * lift, 0),
    rotation([0, 0, 1], spin),
    scaling(scale),
    translation(-pivot[0], -pivot[1], 0),
  )
  return { matrix, flat, lift, scale, pivot, target }
}

/** 折り目の角度（谷折りは手前へ、山折りは奥へ。どちらも 180° で平らに重なる） */
export function hingeAngles(c: number) {
  const B = FOLD_BEATS
  return {
    strip: -Math.PI * easeFold(segment(c, B.squareStart, B.squareEnd)),
    flap: -Math.PI * easeFold(segment(c, B.squareEnd, B.diagonalEnd)),
    left: -Math.PI * easeFold(segment(c, B.diagonalEnd, B.halfEnd)),
  }
}

function hinges(c: number, size: SheetSize): Record<FaceId, Mat4> {
  const { x0, BL } = paperPoints(size)
  const angle = hingeAngles(c)
  const none = translation(0, 0, 0)
  return {
    sheet: none,
    square: none,
    lower: none,
    right: none,
    // 左の余り: 正方形の左端を軸に、奥へ（山折り）
    strip: rotationAbout([x0, 0, 0], [0, 1, 0], angle.strip),
    // 右上の三角: 左上と右下を結ぶ対角線を軸に、手前へ（谷折り）
    flap: rotationAbout([x0, 0, 0], [1, 1, 0], angle.flap),
    // 三角の左半分: 直角の角と斜辺の中点を結ぶ線を軸に、手前へ
    left: rotationAbout([BL[0], BL[1], 0], [1, -1, 0], angle.left),
  }
}

/** その時刻に見えている面（奥から順） */
export function activeFaces(c: number): FaceId[] {
  const B = FOLD_BEATS
  if (c < B.squareStart) return ['sheet']
  if (c < B.squareEnd) return ['strip', 'square']
  if (c < B.diagonalEnd) return ['lower', 'flap']
  if (c < B.halfEnd) return ['right', 'left']
  return []
}

export function foldFrame(
  c: number,
  size: SheetSize,
  center: Vec2,
  endScale: number,
  origin: Vec2,
): FoldFrame {
  const root = rootAt(c, size, center, endScale)
  const hinge = hinges(c, size)
  const defs = new Map(faceDefs(size).map((def) => [def.id, def]))
  const angle = hingeAngles(c)
  // 下の面には、折られている面の影が落ちる
  const occlusion: Partial<Record<FaceId, number>> = {
    lower: 0.28 * Math.sin(-angle.flap) * (-angle.flap / Math.PI),
    right: 0.22 * Math.sin(-angle.left) * (-angle.left / Math.PI),
  }

  const faces = activeFaces(c).flatMap((id, order): FaceState[] => {
    const def = defs.get(id)
    if (!def) return []
    const toWorld = compose(root.matrix, hinge[id])
    const screen = def.polygon.map((p) =>
      project(apply(toWorld, [p[0], p[1], 0]), origin, PERSPECTIVE),
    )
    const front = Math.sign(signedArea(screen)) === Math.sign(signedArea(def.polygon))
    const normal = normalize(applyDirection(toWorld, [0, 0, 1]))
    const visible: Vec3 = front ? normal : [-normal[0], -normal[1], -normal[2]]
    const lit = lightFor(visible)
    const extra = occlusion[id] ?? 0
    return [
      {
        id,
        matrix: compose(toWorld, translation(def.bounds.x, def.bounds.y, 0)),
        side: front ? 'front' : 'back',
        lighting: { shade: lit.shade + extra, sheen: lit.sheen },
        order,
      },
    ]
  })

  const B = FOLD_BEATS
  const center3: Vec3 = apply(root.matrix, [root.pivot[0], root.pivot[1], 0])
  const onTable = project([center3[0], center3[1], 0], origin, PERSPECTIVE)
  const blobSize = size.height * root.scale
  return {
    faces,
    restShadow: 1 - easeWa(segment(c, 0, 0.18)),
    liftShadow: root.lift * (1 - segment(c, B.squareStart, 0.42)),
    shadowMatrix: root.flat,
    blob: {
      x: onTable[0] + 10 * root.lift,
      y: onTable[1] + 18 * root.lift,
      width: blobSize * 1.3,
      height: blobSize * 0.5,
      opacity: 0.34 * segment(c, B.squareStart, B.squareEnd),
    },
  }
}

/** 紙の点が、その時刻に画面のどこに見えるか */
export function projectPaperPoint(
  c: number,
  size: SheetSize,
  center: Vec2,
  endScale: number,
  origin: Vec2,
  point: Vec2,
): Vec2 {
  const root = rootAt(c, size, center, endScale)
  return project(apply(root.matrix, [point[0], point[1], 0]), origin, PERSPECTIVE)
}

/**
 * 半分に折り終えた三角（紅）の、画面の上の 3 つの角。ここから鶴の形に替わる。
 * 返す順は [左下, 右下, 上の頂点]
 */
export function foldedTriangle(
  size: SheetSize,
  center: Vec2,
  endScale: number,
  origin: Vec2,
): [Vec2, Vec2, Vec2] {
  const { BL, BR, mid } = paperPoints(size)
  const at = (p: Vec2) => projectPaperPoint(FOLD_BEATS.halfEnd, size, center, endScale, origin, p)
  return [at(BL), at(BR), at(mid)]
}
