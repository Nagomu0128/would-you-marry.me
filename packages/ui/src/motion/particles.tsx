import { m } from 'motion/react'
import type { CSSProperties } from 'react'

/** 粒の配置を固定する疑似乱数（0〜1）。同じ i と salt なら毎回同じ値になる */
export function seeded(i: number, salt = 1): number {
  const x = Math.sin((i + 1) * 12.9898 * salt) * 43758.5453
  return x - Math.floor(x)
}

/** 0〜count-1 の粒それぞれに、i ごとに固定した乱数 r(k) を渡して形を決める */
function particles<T>(
  count: number,
  salt: number,
  make: (r: (k: number) => number, i: number) => T,
) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${salt}-${i}`,
    ...make((k) => seeded(i, salt + k), i),
  }))
}

/** 金箔の小片の形。切り箔のように、少しずつ違う不揃いの四角形 */
function flakeShape(r: (k: number) => number): string {
  const v = (k: number) => Math.round(r(20 + k) * 22)
  return `polygon(${v(1)}% ${v(2)}%, ${100 - v(3)}% ${v(4)}%, ${100 - v(5)}% ${100 - v(6)}%, ${v(7)}% ${100 - v(8)}%)`
}

export type KinpakuFlakesProps = {
  /** 粒の数（多くても 20 程度） */
  count: number
  /** 舞い始める時刻（秒） */
  delay: number
  /** 一片が落ちきるまでの長さ（秒）の目安 */
  duration: number
}

/**
 * 金箔が光を受けながら舞い落ちる。薄い箔が縦横に返るので、面が光る瞬間と細く消える瞬間が交互に来る。
 * 配置は seed で固定し、舞台と一緒に DOM から消える
 */
export function KinpakuFlakes({ count, delay, duration }: KinpakuFlakesProps) {
  const flakes = particles(count, 3, (r, i) => {
    const size = 0.5 + r(1) * 0.6
    return {
      tone: i % 3,
      sway: (r(2) - 0.5) * 18,
      start: delay + r(3) * 0.9,
      fall: duration * (0.85 + r(4) * 0.35),
      spin: (r(5) - 0.5) * 220,
      mid: 46 + r(8) * 20,
      end: 100 + r(9) * 10,
      flipX: 200 + r(10) * 320,
      flipY: 120 + r(11) * 240,
      style: {
        left: `${4 + ((i * 37) % 92) + r(6) * 4}%`,
        inlineSize: `${size}rem`,
        blockSize: `${size * (0.7 + r(7) * 0.5)}rem`,
        clipPath: flakeShape(r),
      } satisfies CSSProperties,
    }
  })
  return (
    <div className="ceremony-kinpaku">
      {flakes.map((flake) => (
        <m.span
          key={flake.id}
          className="ceremony-kinpaku-flake"
          data-tone={flake.tone}
          style={flake.style}
          initial={{ y: '-8vh', x: 0, opacity: 0, rotate: 0, rotateX: 0, rotateY: 0 }}
          animate={{
            y: ['-8vh', `${flake.mid}vh`, `${flake.end}vh`],
            x: [0, flake.sway, -flake.sway * 0.6],
            opacity: [0, 1, 1, 0.85],
            rotate: [0, flake.spin],
            rotateX: [0, flake.flipX],
            rotateY: [0, flake.flipY],
          }}
          transition={{
            delay: flake.start,
            duration: flake.fall,
            ease: 'linear',
            y: {
              delay: flake.start,
              duration: flake.fall,
              times: [0, 0.48, 1],
              ease: ['easeOut', 'easeIn'],
            },
            x: { delay: flake.start, duration: flake.fall, ease: 'easeInOut' },
            opacity: { delay: flake.start, duration: flake.fall, times: [0, 0.1, 0.8, 1] },
          }}
        />
      ))}
    </div>
  )
}

/** 紙吹雪の色: 紅・金・白（金は箔のグラデーション） */
const PAPER_TONES = ['beni', 'kin', 'shiro', 'beni', 'kin', 'shiro', 'kin'] as const

export type PaperConfettiProps = {
  /** 紙片の数（30〜40 まで） */
  count: number
  /** 弾ける時刻（秒） */
  delay: number
  /** 配置を変えるための種 */
  seed?: number
  /** 弾ける強さ（1 で半径 約 120〜230px） */
  power?: number
  /** 弾ける中心（親の中での位置） */
  style?: CSSProperties
}

/**
 * 紅・金・白の紙吹雪。中心から上へ扇状に弾け、紙の張りで翻りながら（3D に回りながら）落ちていく
 */
export function PaperConfetti({ count, delay, seed = 1, power = 1, style }: PaperConfettiProps) {
  const papers = particles(count, seed * 11, (r, i) => {
    // 真上を中心に左右 約 110° の扇
    const angle = -Math.PI / 2 + (r(1) - 0.5) * Math.PI * 1.25
    const reach = (120 + r(2) * 110) * power
    return {
      tone: PAPER_TONES[i % PAPER_TONES.length],
      shape: r(6) < 0.4 ? 'strip' : r(6) < 0.75 ? 'rect' : 'square',
      dx: Math.cos(angle) * reach,
      up: Math.sin(angle) * reach,
      drop: (180 + r(3) * 160) * power,
      start: delay + r(4) * 0.08,
      life: 1.35 + r(5) * 0.55,
      spin: (r(7) - 0.5) * 540,
      flipX: 360 + r(8) * 540,
      flipY: (r(9) - 0.5) * 720,
    }
  })
  return (
    <div className="ceremony-confetti" style={style}>
      {papers.map((paper) => (
        <m.span
          key={paper.id}
          className="ceremony-paper"
          data-tone={paper.tone}
          data-shape={paper.shape}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0, rotateX: 0, rotateY: 0 }}
          animate={{
            x: [0, paper.dx, paper.dx * 1.2],
            y: [0, paper.up, paper.up + paper.drop],
            opacity: [0, 1, 1, 0],
            scale: [0.4, 1, 1],
            rotate: [0, paper.spin],
            rotateX: [0, paper.flipX],
            rotateY: [0, paper.flipY],
          }}
          transition={{
            delay: paper.start,
            duration: paper.life,
            ease: 'linear',
            x: {
              delay: paper.start,
              duration: paper.life,
              times: [0, 0.3, 1],
              ease: ['easeOut', 'linear'],
            },
            y: {
              delay: paper.start,
              duration: paper.life,
              times: [0, 0.3, 1],
              ease: [
                [0.2, 0.8, 0.4, 1],
                [0.5, 0, 0.9, 0.6],
              ],
            },
            opacity: { delay: paper.start, duration: paper.life, times: [0, 0.04, 0.72, 1] },
            scale: { delay: paper.start, duration: paper.life, times: [0, 0.12, 1] },
          }}
        />
      ))}
    </div>
  )
}
