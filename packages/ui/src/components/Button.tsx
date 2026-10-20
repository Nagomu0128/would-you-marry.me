import { type HTMLMotionProps, m } from 'motion/react'
import type { ReactNode, Ref } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'text'

export type ButtonProps = Omit<HTMLMotionProps<'button'>, 'children' | 'ref'> & {
  ref?: Ref<HTMLButtonElement>
  /** 主要（Charcoal の塗り）/ 補助（枠線）/ テキスト */
  variant?: ButtonVariant
  /** 読み込み中。押せなくなり、読み上げでは処理中として伝える（くるくる回る表示は使わない） */
  loading?: boolean
  /** 危険な操作。主要ボタンを Error 色にする */
  danger?: boolean
  /** 横幅いっぱいにする */
  fullWidth?: boolean
  children?: ReactNode
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-charcoal text-white',
  secondary: 'border border-charcoal bg-transparent text-charcoal',
  text: 'bg-transparent text-deep-gold',
}

/** 高さ 48px。押すと少し縮む。 */
export function Button({
  variant = 'primary',
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
      whileTap={inactive ? undefined : { scale: 0.97 }}
      className={cn(
        'inline-flex h-control min-w-tap items-center justify-center gap-2 rounded-control px-6 text-body font-semibold',
        'transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne',
        variant === 'primary' && danger ? 'bg-error text-white' : variantClass[variant],
        fullWidth && 'w-full',
        disabled && 'cursor-not-allowed opacity-40',
        loading && 'animate-pulse cursor-progress motion-reduce:animate-none',
        className,
      )}
      {...rest}
    >
      {children}
    </m.button>
  )
}
