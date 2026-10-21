import type { ReactNode } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'
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
  return (
    <Dialog
      open={open}
      onClose={onClose}
      label={confirmLabel}
      dismissible={!loading}
      initialFocus={input ? 'input' : '[data-cancel]'}
      testId="confirm-backdrop"
    >
      <p className="eyebrow text-accent mb-3">Please confirm</p>
      <h2 className="modal-title">{confirmLabel}</h2>
      <p className="text-sub text-muted mb-5">{body}</p>
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
      <div className="modal-actions">
        <Button
          fullWidth
          loading={loading}
          disabled={confirmDisabled}
          onClick={onConfirm}
          danger={danger}
        >
          {confirmLabel}
        </Button>
        <Button data-cancel variant="secondary" fullWidth disabled={loading} onClick={onClose}>
          {cancelLabel}
        </Button>
      </div>
    </Dialog>
  )
}
