import { clamp, dot, normalize, type Vec3 } from './math'

/** 光は左上の手前から当たる（画面の紙にとって自然な向き） */
export const LIGHT: Vec3 = normalize([-0.42, -0.62, 0.66])
const VIEW: Vec3 = [0, 0, 1]
const HALF: Vec3 = normalize([LIGHT[0] + VIEW[0], LIGHT[1] + VIEW[1], LIGHT[2] + VIEW[2]])
const SHEEN_POWER = 28
const FLAT_SPECULAR = HALF[2] ** SHEEN_POWER

export type Lighting = {
  /** 墨を重ねる濃さ（0〜） */
  shade: number
  /** 白を重ねる明るさ（0〜）。和紙の鈍い艶 */
  sheen: number
}

/**
 * 見えている面の法線（手前向き）から、平らに置いた紙との明るさの差を返す。
 * 平らな紙は shade = sheen = 0 で、紙の色そのままに見える。
 */
export function lightFor(normal: Vec3): Lighting {
  const n = normalize(normal)
  const delta = dot(LIGHT, n) - LIGHT[2]
  const specular = Math.max(0, dot(n, HALF)) ** SHEEN_POWER - FLAT_SPECULAR
  return {
    shade: clamp(-delta * 1.15, 0, 0.62),
    sheen: clamp(delta * 0.85, 0, 0.5) + clamp(specular * 0.6, 0, 0.35),
  }
}
