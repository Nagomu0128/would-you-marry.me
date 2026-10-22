import { type HTMLMotionProps, m } from 'motion/react'
import type { ReactNode, Ref } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'text'

/** 主要ボタンの紙の色。墨（既定）か紅（お祝いの主な操作） */
export type ButtonTone = 'sumi' | 'beni'

export type ButtonProps = Omit<HTMLMotionProps<'button'>, 'children' | 'ref'> & {
  ref?: Ref<HTMLButtonElement>
  /** 主要（墨・紅の紙）/ 補助（金の細罫）/ テキスト */
  variant?: ButtonVariant
  /** 主要ボタンの色。既定は墨 */
  tone?: ButtonTone
  /** 読み込み中。押せなくなり、読み上げでは処理中として伝える（くるくる回る表示は使わない） */
  loading?: boolean
  /** 危険な操作。主要ボタンを Error 色にする */
  danger?: boolean
  /** 横幅いっぱいにする */
  fullWidth?: boolean
  children?: ReactNode
}

/**
 * 最小高 3.25rem。文字拡大時は内容に合わせて伸びる。
 * 無効のときも文字が読める色のまま（薄くしない）。読み込み中は金の線が流れる。
 */
export function Button({
  variant = 'primary',
  tone = 'sumi',
  loading = false,
  danger = false,
  fullWidth = false,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const inactive = disabled || loading
  return (
    <m.button
      type={type}
      disabled={inactive}
      aria-busy={loading || undefined}
      whileTap={inactive ? undefined : { scale: 0.985 }}
      data-variant={variant}
      data-tone={variant === 'primary' ? tone : undefined}
      data-danger={danger || undefined}
      className={cn('ui-button', fullWidth && 'w-full', className)}
      {...rest}
    >
      {children}
    </m.button>
  )
}
