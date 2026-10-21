import type { ReactNode } from 'react'

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
