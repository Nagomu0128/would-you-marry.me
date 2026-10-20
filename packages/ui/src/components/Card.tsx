import type { HTMLAttributes } from 'react'
import { cn } from './cn'

export type CardProps = HTMLAttributes<HTMLDivElement>

/** White の面、角丸 16px、控えめな影 */
export function Card({ className, ...rest }: CardProps) {
  return <div className={cn('rounded-card bg-surface p-4 shadow-card', className)} {...rest} />
}
