import { AnimatePresence, m } from 'motion/react'
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { DURATION } from './constants'
import { TextField } from './TextField'

export type ConfirmSheetInput = {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  placeholder?: string
}

export type ConfirmSheetProps = {
  open: boolean
  /** キャンセル・Esc・背景のタップで呼ぶ */
  onClose: () => void
  onConfirm: () => void
  /** 本文（messages の `confirms.*.body`） */
  body: ReactNode
  confirmLabel: string
  cancelLabel: string
  /** 危険な操作。確定ボタンを Error 色にする */
  danger?: boolean
  /** 実行中。ボタンを押せなくする */
  loading?: boolean
  /** 確定ボタンを押せなくする（入力が空のときなど） */
  confirmDisabled?: boolean
  /** テキスト入力つきにする（テナント削除の確認用） */
  input?: ConfirmSheetInput
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/**
 * 画面下から出る確認シート。開くと中にフォーカスを移し（入力があれば入力欄、なければキャンセル）、
 * Tab は中で循環し、Esc で閉じ、閉じたら元の要素にフォーカスを戻す。
 */
export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  loading = false,
  confirmDisabled = false,
  input,
}: ConfirmSheetProps) {
  const bodyId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const hasInput = input !== undefined

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const target = hasInput ? sheetRef.current?.querySelector<HTMLElement>('input') : null
    ;(target ?? cancelRef.current)?.focus()
    return () => previous?.focus()
  }, [open, hasInput])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCloseRef.current()
      return
    }
    if (event.key !== 'Tab') return
    const nodes = sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (!nodes || nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <m.div
            aria-hidden="true"
            data-testid="confirm-backdrop"
            className="absolute inset-0 bg-charcoal/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fast }}
            onClick={onClose}
          />
          <m.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-describedby={bodyId}
            onKeyDown={handleKeyDown}
            className="safe-bottom layout-guest relative flex flex-col gap-4 rounded-t-card bg-surface px-screen pt-6 pb-4 shadow-card"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: DURATION.slow, ease: 'easeOut' }}
          >
            <p id={bodyId} className="text-body text-charcoal">
              {body}
            </p>
            {input ? (
              <TextField
                label={input.label}
                value={input.value}
                onChange={(event) => input.onChange(event.target.value)}
                error={input.error}
                placeholder={input.placeholder}
                autoComplete="off"
              />
            ) : null}
            <div className="flex flex-col gap-2">
              <Button
                variant="primary"
                fullWidth
                loading={loading}
                disabled={confirmDisabled}
                onClick={onConfirm}
                danger={danger}
              >
                {confirmLabel}
              </Button>
              <Button
                ref={cancelRef}
                variant="secondary"
                fullWidth
                disabled={loading}
                onClick={onClose}
              >
                {cancelLabel}
              </Button>
            </div>
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
