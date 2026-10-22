// 折り鶴の演出で使う 3D の計算。座標は CSS と同じ向き（x は右、y は下、z は手前）。
// 行列は列優先の 16 要素（CSS の matrix3d() と同じ並び）。

export type Vec2 = readonly [number, number]
export type Vec3 = readonly [number, number, number]
export type Mat4 = readonly number[]

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/** a・b（b を先に適用する） */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0)
      out[col * 4 + row] = sum
    }
  }
  return out
}

export function compose(...matrices: Mat4[]): Mat4 {
  return matrices.reduce((acc, m) => multiply(acc, m), IDENTITY)
}

export function translation(x: number, y: number, z = 0): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]
}

export function scaling(s: number): Mat4 {
  return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]
}

/** 単位ベクトルの軸のまわりの回転（右手系。z 軸まわりの正の角は画面で時計回り） */
export function rotation(axis: Vec3, angle: number): Mat4 {
  const [x, y, z] = normalize(axis)
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const t = 1 - c
  return [
    c + x * x * t,
    y * x * t + z * s,
    z * x * t - y * s,
    0,
    x * y * t - z * s,
    c + y * y * t,
    z * y * t + x * s,
    0,
    x * z * t + y * s,
    y * z * t - x * s,
    c + z * z * t,
    0,
    0,
    0,
    0,
    1,
  ]
}

/** 点 p を通る軸のまわりの回転。紙の折り目（蝶番）に使う */
export function rotationAbout(point: Vec3, axis: Vec3, angle: number): Mat4 {
  return compose(
    translation(point[0], point[1], point[2]),
    rotation(axis, angle),
    translation(-point[0], -point[1], -point[2]),
  )
}

export function apply(m: Mat4, p: Vec3): Vec3 {
  const [x, y, z] = p
  return [
    (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0),
    (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0),
    (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0),
  ]
}

/** 向き（平行移動を含めない） */
export function applyDirection(m: Mat4, v: Vec3): Vec3 {
  const [x, y, z] = v
  return [
    (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z,
    (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z,
    (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z,
  ]
}

export function toMatrix3d(m: Mat4): string {
  return `matrix3d(${m.map((v) => round(v, 6)).join(',')})`
}

/**
 * CSS の perspective と同じ投影。origin は perspective-origin（画面の座標）、distance は perspective の値。
 * 親に perspective を置いた要素の見た目と一致する。
 */
export function project(p: Vec3, origin: Vec2, distance: number): Vec2 {
  const w = 1 - p[2] / distance
  return [origin[0] + (p[0] - origin[0]) / w, origin[1] + (p[1] - origin[1]) / w]
}

export function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** 多角形の符号つき面積（y が下向きの画面座標で、時計回りが正） */
export function signedArea(points: readonly Vec2[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (!a || !b) continue
    sum += a[0] * b[1] - b[0] * a[1]
  }
  return sum / 2
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function lerp2(a: Vec2, b: Vec2, t: number): Vec2 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** 区間 [start, end] の中での進み具合（0〜1） */
export function segment(t: number, start: number, end: number): number {
  if (end <= start) return t >= end ? 1 : 0
  return clamp((t - start) / (end - start), 0, 1)
}

export function round(v: number, digits = 2): number {
  const f = 10 ** digits
  return Math.round(v * f) / f
}

/** CSS の cubic-bezier() と同じ緩急（x から y を二分法で求める） */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const bez = (a: number, b: number, t: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3
  return (x: number): number => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0
    let hi = 1
    let t = x
    for (let i = 0; i < 24; i++) {
      t = (lo + hi) / 2
      if (bez(x1, x2, t) < x) lo = t
      else hi = t
    }
    return bez(y1, y2, t)
  }
}

/** --ease-fold（紙を折る: 溜めてから一気に、最後は静かに置く） */
export const easeFold = cubicBezier(0.65, 0, 0.35, 1)
/** --ease-wa（動き出しは速く、静かに止まる） */
export const easeWa = cubicBezier(0.22, 0.61, 0.36, 1)
export const easeIn = cubicBezier(0.5, 0, 0.9, 0.55)
export const easeOut = cubicBezier(0.1, 0.45, 0.4, 1)

/** 行き過ぎてから戻る（小さな spring の代わり。overshoot は 0.1〜0.25 程度） */
export function easeOutBack(t: number, overshoot = 1.4): number {
  const c = overshoot
  const x = t - 1
  return 1 + (c + 1) * x ** 3 + c * x ** 2
}

/** 0 → 1 → 0 の山（押さえる・弾む動きに使う） */
export function bump(t: number): number {
  return Math.sin(Math.PI * clamp(t, 0, 1))
}

// 3 次ベジェ曲線（飛ぶ道筋）
export function bezier(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ]
}

export function bezierTangent(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t
  return [
    3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
    3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]),
  ]
}

// 色（#rrggbb）の混ぜ合わせ。紙の陰影を SVG の塗りで表すときに使う
export type Rgb = readonly [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

export function rgbToCss(c: Rgb): string {
  return `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])})`
}

/** 決まった並びの乱数（seed で配置を固定する） */
export function seeded(i: number, salt = 1): number {
  const x = Math.sin((i + 1) * 12.9898 * salt + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}
