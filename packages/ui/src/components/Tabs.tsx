import { m } from 'motion/react'
import type { CSSProperties, KeyboardEvent } from 'react'
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
  /** @deprecated 選択の印はタブの数から位置を決めるので不要になった */
  layoutId?: string
  className?: string
}

/**
 * 和綴じの見出し紙のようなタブ。選ばれたタブには金の下線と菱が付き、
 * 切り替えると印が横へ滑って移る（タブは等幅なので、位置は順番から決まる）。
 * 矢印キーで移動できる。選択は文字の太さ・色と印で示す（色だけにしない）。
 */
export function Tabs<T extends string = string>({
  tabs,
  value,
  onChange,
  'aria-label': ariaLabel,
  className,
}: TabsProps<T>) {
  const selectedIndex = tabs.findIndex((tab) => tab.id === value)

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
      className={cn('tabs', className)}
      style={{ '--tab-count': tabs.length } as CSSProperties}
    >
      {tabs.map((tab, index) => {
        const selected = index === selectedIndex
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
            className="tab"
          >
            {tab.label}
          </button>
        )
      })}
      {selectedIndex >= 0 ? (
        <m.span
          aria-hidden="true"
          className="tab-mark"
          initial={false}
          animate={{ x: `${selectedIndex * 100}%` }}
          transition={{ duration: DURATION.slow, ease: [0.22, 0.61, 0.36, 1] }}
        />
      ) : null}
    </div>
  )
}
