import { ja } from '../messages/ja'
import { MizuhikiKnot } from '../ornaments/MizuhikiKnot'
import { Button } from './Button'
import { cn } from './cn'

export type ErrorStateProps = {
  /** 既定は通信エラーの文言 */
  message?: string
  /** 「もう一度試す」を押したとき */
  onRetry?: () => void
  className?: string
}

/** 画面内のエラー表示。紙の上に小さな水引と文言、「もう一度試す」。 */
export function ErrorState({ message = ja.errors.network, onRetry, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn('error-state', className)}>
      <MizuhikiKnot strands="one" tone="kin" className="error-state-knot" />
      <p className="error-state-message">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {ja.common.retry}
        </Button>
      ) : null}
    </div>
  )
}
