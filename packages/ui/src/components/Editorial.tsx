import type { ReactNode } from 'react'
import { cn } from './cn'

export function Brand({ caption = 'A day to remember' }: { caption?: string }) {
  return (
    <div className="brand">
      <span className="brand-monogram" aria-hidden="true">
        &
      </span>
      <p className="brand-name">
        The Wedding Journal
        <span className="brand-caption">{caption}</span>
      </p>
    </div>
  )
}

export function SectionHeading({
  title,
  caption,
  action,
}: {
  title: string
  caption?: string
  action?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        {caption ? (
          <p className="eyebrow" lang="en">
            {caption}
          </p>
        ) : null}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  )
}

export function PageLoading({ className }: { className?: string }) {
  return (
    <div className={cn('px-screen py-12', className)} aria-busy="true">
      <span className="sr-only-text">読み込み中</span>
      <p className="eyebrow text-muted">The Wedding Journal</p>
      <div className="mt-6 h-px bg-rule" />
      <div className="mt-6 h-8 w-2/3 rounded bg-rule/60" />
      <div className="mt-8 h-48 rounded bg-rule/40" />
    </div>
  )
}
