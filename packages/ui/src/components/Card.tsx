import type { HTMLAttributes } from 'react'
import { cn } from './cn'

export type CardProps = HTMLAttributes<HTMLDivElement>

/** 手に取る紙（surface の和紙）。細い罫と、紙が浮く程度の薄い影 */
export function Card({ className, ...rest }: CardProps) {
  return <div className={cn('ui-card', className)} {...rest} />
}
