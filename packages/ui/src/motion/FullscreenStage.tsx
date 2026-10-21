import { m, useReducedMotion } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'
import { useCompleteOnce } from './use-complete-once'

export type FullscreenStageProps = {
  /** 演出の長さ（秒） */
  duration: number
  onComplete: () => void
  /** 飛ばすための操作の読み上げ用ラベル（文言は呼び出し側が messages から渡す） */
  skipLabel: string
  children: ReactNode
}

// 画面の操作を遮らない招待状。スキップまたは時間経過で閉じる。
export function FullscreenStage({
  duration,
  onComplete,
  skipLabel,
  children,
}: FullscreenStageProps) {
  const reduced = useReducedMotion()
  const { complete } = useCompleteOnce(onComplete)
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    if (reduced) {
      complete()
      return
    }
    const timer = setTimeout(() => {
      setClosed(true)
      complete()
    }, duration * 1000)
    return () => clearTimeout(timer)
  }, [reduced, duration, complete])

  if (reduced || closed) return null

  const skip = () => {
    setClosed(true)
    complete()
  }

  return (
    <div data-testid="motion-stage" className="wedding-stage">
      <m.div
        className="wedding-invitation"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: [0, 1, 1, 0], y: [-12, 0, 0, -6] }}
        transition={{ duration, times: [0, 0.14, 0.86, 1], ease: 'easeInOut' }}
      >
        {children}
        <button type="button" className="wedding-skip" onClick={skip}>
          {skipLabel}
        </button>
      </m.div>
    </div>
  )
}
