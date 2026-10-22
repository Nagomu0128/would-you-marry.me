import { m, useReducedMotion } from 'motion/react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { CEREMONY_FADE_OUT } from './durations'
import { useCompleteOnce } from './use-complete-once'

/** 舞台の見立て。ceremony.css の見た目を切り替える */
export type CeremonyScene = 'byobu' | 'tsuru' | 'shuin'

export type FullscreenStageProps = {
  /** 演出の長さ（秒）。終わりの CEREMONY_FADE_OUT 秒で舞台が溶ける */
  duration: number
  onComplete: () => void
  /** 飛ばすボタンのラベル（文言は呼び出し側が messages から渡す） */
  skipLabel: string
  scene: CeremonyScene
  /** 舞台が現れるまでの秒数。0 なら最初のコマから画面を覆う */
  fadeIn?: number
  children: ReactNode
}

/**
 * 画面全体を覆う儀式の舞台。画面のどこをタップしても、Escape でも、スキップのボタンでも飛ばせる。
 * 飛ばすか時間が来たら DOM から消え、onComplete を一度だけ呼ぶ。動きを減らす設定では何も出さない。
 * 背面の画面には触れない（body のスクロールを止めず、舞台の上の指の動きだけ受け止める）
 */
export function FullscreenStage({
  duration,
  onComplete,
  skipLabel,
  scene,
  fadeIn = 0,
  children,
}: FullscreenStageProps) {
  const reduced = useReducedMotion()
  const { complete } = useCompleteOnce(onComplete)
  const [closed, setClosed] = useState(false)

  const close = useCallback(() => {
    setClosed(true)
    complete()
  }, [complete])

  useEffect(() => {
    if (reduced) {
      complete()
      return
    }
    const timer = setTimeout(close, duration * 1000)
    return () => clearTimeout(timer)
  }, [reduced, duration, complete, close])

  useEffect(() => {
    if (reduced || closed) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [reduced, closed, close])

  if (reduced || closed) return null

  const from = fadeIn > 0 ? 0 : 1
  return (
    <m.div
      data-testid="motion-stage"
      className="ceremony-stage"
      data-scene={scene}
      initial={{ opacity: from }}
      animate={{ opacity: [from, 1, 1, 0] }}
      transition={{
        duration,
        times: [0, fadeIn / duration, (duration - CEREMONY_FADE_OUT) / duration, 1],
        ease: ['easeOut', 'linear', 'easeIn'],
      }}
    >
      <div className="ceremony-scene" aria-hidden="true">
        {children}
      </div>
      {/* 画面のどこをタップしても飛ばせる面。読み上げとフォーカスは下のボタンが受け持つ */}
      <button
        type="button"
        className="ceremony-tap"
        tabIndex={-1}
        aria-hidden="true"
        onClick={close}
      />
      <button type="button" className="ceremony-skip" onClick={close}>
        {skipLabel}
      </button>
    </m.div>
  )
}
