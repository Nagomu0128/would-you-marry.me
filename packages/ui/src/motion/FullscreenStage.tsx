import { useReducedMotion } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'
import { useCompleteOnce } from './use-complete-once'

export type FullscreenStageProps = {
  /** 演出の長さ（秒） */
  duration: number
  onComplete: () => void
  /** 飛ばすための操作の読み上げ用ラベル（文言は呼び出し側が messages から渡す） */
  skipLabel?: string
  children: ReactNode
}

// 全画面の演出の共通部分。タップで飛ばせる。動きを減らす設定では何も出さずすぐ完了する
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
    <div
      data-testid="motion-stage"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        overflow: 'hidden',
        pointerEvents: 'none',
        color: 'var(--color-charcoal)',
      }}
    >
      {children}
      {/* 画面全体のボタン。タップすると演出が即座に消え、以降の操作は裏の画面に届く */}
      <button
        type="button"
        aria-label={skipLabel}
        onClick={skip}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      />
    </div>
  )
}

// 紙のような背景（演出の下地）
export const paperBackground = {
  position: 'absolute',
  inset: 0,
  backgroundColor: 'var(--color-ivory)',
} as const
