import { ja } from '../messages/ja'
import { Button } from './Button'
import { cn } from './cn'

export type ErrorStateProps = {
  /** 既定は通信エラーの文言 */
  message?: string
  /** 「もう一度試す」を押したとき */
  onRetry?: () => void
  className?: string
}

/** 画面内のエラー表示。通信できなかったときの「もう一度試す」つき。 */
export function ErrorState({ message = ja.errors.network, onRetry, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn('empty-state', className)}>
      <p className="text-body text-ink">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {ja.common.retry}
        </Button>
      ) : null}
    </div>
  )
}
