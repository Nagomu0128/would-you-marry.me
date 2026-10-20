import { type InputHTMLAttributes, type ReactNode, useId } from 'react'
import { cn } from './cn'

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & {
  /** ラベル。「利用規約」などのリンクを含められる */
  label: ReactNode
  error?: string
}

/** 同意欄用のチェックボックス。ラベルを含めた行全体が 44px 以上のタップ領域になる。 */
export function Checkbox({ label, error, id, className, ...rest }: CheckboxProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = `${inputId}-error`
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex min-h-tap items-start gap-3">
        <input
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="mt-[10px] size-6 shrink-0 accent-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne"
          {...rest}
        />
        <label htmlFor={inputId} className="py-2 text-body text-charcoal">
          {label}
        </label>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sub text-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
