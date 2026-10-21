import { type InputHTMLAttributes, useId } from 'react'
import { cn } from './cn'

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  /** 入力欄の上に出すラベル */
  label: string
  /** 欄の下に Error 色で出すエラー文言 */
  error?: string
  /** 現在の文字数。`max` と一緒に渡すと「0 / 20」を右下に出す */
  count?: number
  /** 文字数の上限（表示用。入力は止めず、超えたらエラーで知らせる） */
  max?: number
  /** ラベルの下の補足 */
  hint?: string
}

/** 高さ 48px、文字 16px（iPhone の Safari で拡大されない）。 */
export function TextField({
  label,
  error,
  count,
  max,
  hint,
  id,
  className,
  ...rest
}: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const countId = `${inputId}-count`
  const showCount = count !== undefined && max !== undefined

  const describedBy =
    [hint ? hintId : null, error ? errorId : null, showCount ? countId : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className={cn('field', className)}>
      <label htmlFor={inputId} className="field-label">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-caption text-muted">
          {hint}
        </p>
      ) : null}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="field-input"
        {...rest}
      />
      {error || showCount ? (
        <div className="flex items-start justify-between gap-3">
          <p id={errorId} className="text-sub text-error" role={error ? 'alert' : undefined}>
            {error}
          </p>
          {showCount ? (
            <p id={countId} className="ml-auto shrink-0 text-caption text-muted">
              {count} / {max}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
