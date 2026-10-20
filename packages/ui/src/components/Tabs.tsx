import { m } from 'motion/react'
import { type KeyboardEvent, useId } from 'react'
import { cn } from './cn'
import { DURATION } from './constants'

export type TabItem<T extends string = string> = {
  id: T
  label: string
  /** 対応するパネルの id（`aria-controls` に使う） */
  panelId?: string
}

export type TabsProps<T extends string = string> = {
  tabs: readonly TabItem<T>[]
  value: T
  onChange: (id: T) => void
  /** タブ一覧の読み上げ名 */
  'aria-label'?: string
  /** 下線の共有レイアウト ID。同じ画面に複数のタブを置くときは変える（既定は自動） */
  layoutId?: string
  className?: string
}

/** 選択中のタブの下線（Champagne）がスライドして移動する。矢印キーで移動できる。 */
export function Tabs<T extends string = string>({
  tabs,
  value,
  onChange,
  'aria-label': ariaLabel,
  layoutId,
  className,
}: TabsProps<T>) {
  const autoId = useId()
  const underlineId = layoutId ?? `tabs-underline-${autoId}`

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const step = event.key === 'ArrowRight' ? 1 : -1
    const next = tabs[(index + step + tabs.length) % tabs.length]
    if (!next) return
    onChange(next.id)
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')
    buttons?.[(index + step + tabs.length) % tabs.length]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex border-b border-sand', className)}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={tab.panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'relative min-h-tap flex-1 px-3 text-body focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-champagne',
              selected ? 'font-semibold text-charcoal' : 'text-warm-gray',
            )}
          >
            {tab.label}
            {selected ? (
              <m.span
                layoutId={underlineId}
                aria-hidden="true"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-champagne"
                transition={{ duration: DURATION.normal, ease: 'easeOut' }}
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
