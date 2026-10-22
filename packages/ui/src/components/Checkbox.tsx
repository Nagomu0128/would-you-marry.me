import { type InputHTMLAttributes, type ReactNode, useId } from 'react'
import { cn } from './cn'

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & {
  /** ラベル。「利用規約」などのリンクを含められる */
  label: ReactNode
  error?: string
}

/**
 * 同意欄用のチェックボックス。チェックすると朱の印が押される。
 * 実体はネイティブの checkbox。ラベルを含めた行全体が 44px 以上のタップ領域になる。
 */
export function Checkbox({ label, error, id, className, ...rest }: CheckboxProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = `${inputId}-error`
  return (
    <div className={cn('check', className)}>
      <div className="check-row">
        <input
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="check-input"
          {...rest}
        />
        <label htmlFor={inputId} className="check-label">
          {label}
        </label>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
