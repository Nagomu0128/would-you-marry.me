import { ja } from '../messages/ja'
import { DrawnKnot } from '../motion/DrawnKnot'
import { cn } from './cn'

export type PageLoadingProps = {
  className?: string
}

/**
 * ルートの遅延読み込み中の表示。水引が結ばれては、結び目の手前からほどけていく線を繰り返す（micro.css の .wa-loading）。
 * 速い読み込みでちらつかないよう、少し待ってから現れる。動きを減らす設定では結び終えた水引を静かに置く。
 */
export function PageLoading({ className }: PageLoadingProps) {
  return (
    <div className={cn('wa-loading', className)} aria-busy="true">
      <span className="sr-only-text">{ja.common.loading}</span>
      <DrawnKnot strands="three" className="wa-loading-knot" />
    </div>
  )
}
