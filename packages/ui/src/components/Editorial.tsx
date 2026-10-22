import type { ReactNode } from 'react'
import { MizuhikiKnot } from '../ornaments/MizuhikiKnot'
import { cn } from './cn'

/**
 * 画面の上端の静かな帯。小さな水引の両側に金の細罫が伸びる。アプリの名前は主張しない。
 * `caption` を渡すと、水引の下に小さな明朝の添え書きを出す（管理画面の題など）。
 */
export function Brand({ caption, className }: { caption?: string; className?: string }) {
  return (
    <div className={cn('brand', className)}>
      <span className="brand-band">
        <MizuhikiKnot strands="one" className="brand-knot" />
      </span>
      {caption ? <span className="brand-caption">{caption}</span> : null}
    </div>
  )
}

/**
 * 段の見出し。明朝の題の両側に金の細罫を引き、中央に置く。
 * `caption` は題の下の小さな添え書き、`action` は見出しの下に置く操作。
 */
export function SectionHeading({
  title,
  caption,
  action,
  id,
}: {
  title: string
  caption?: string
  action?: ReactNode
  id?: string
}) {
  return (
    <div className="section-heading">
      <h2 id={id} className="section-title">
        {title}
      </h2>
      {caption ? <p className="section-caption">{caption}</p> : null}
      {action}
    </div>
  )
}
