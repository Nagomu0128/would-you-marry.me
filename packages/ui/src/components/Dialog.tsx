import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'

/**
 * ネイティブのモーダル（最上位の層・背景の操作の無効化・フォーカスの閉じ込め・Esc）。
 * 通常は下から出る和紙のシート、`fullScreen` は漆黒の全画面。
 */
export function Dialog({
  open = true,
  onClose,
  label,
  children,
  fullScreen = false,
  initialFocus,
  testId,
  dismissible = true,
}: {
  open?: boolean
  onClose: () => void
  label: string
  children: ReactNode
  fullScreen?: boolean
  initialFocus?: string
  testId?: string
  dismissible?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    if (initialFocus) dialog.querySelector<HTMLElement>(initialFocus)?.focus()
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [open, initialFocus])
  if (!open) return null
  return createPortal(
    <dialog
      ref={ref}
      aria-modal="true"
      aria-label={label}
      data-testid={testId}
      className={cn(fullScreen ? 'viewer-dialog' : 'modal')}
      onCancel={(event) => {
        event.preventDefault()
        if (dismissible) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          if (dismissible) onClose()
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !fullScreen && dismissible) onClose()
      }}
    >
      {fullScreen ? (
        children
      ) : (
        <>
          <span className="modal-edge" aria-hidden="true" />
          <div className="modal-content">{children}</div>
        </>
      )}
    </dialog>,
    document.body,
  )
}
