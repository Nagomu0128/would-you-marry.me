import { cn } from './cn'

/** ルートの遅延読み込み中の表示 */
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
