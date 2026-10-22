import { cn } from '../../components/cn'
import { OrizuruStage } from './OrizuruStage'
import { SheetFace } from './SheetFace'
import type { OrizuruSequence } from './use-orizuru-sequence'

export type GuestbookSheetProps = {
  /** 入力中の名前。紙に筆文字で書き写す（読み上げない） */
  name: string
  /** 縦書きの見出し（「御芳名」） */
  heading: string
  /** 名前が空のときの薄墨の案内 */
  placeholder: string
  /** 鶴が通信を待って舞っているあいだに出す言葉 */
  waitingLabel: string
  sequence: OrizuruSequence
  /** ニックネームの変更（紙を少し小さく） */
  compact?: boolean
  className?: string
}

/**
 * 受付の芳名帳の紙。入力した名前が縦書きの筆文字で書き込まれていく。
 * 送信すると、この紙が折られて鶴になり、画面の上へ飛び立つ（useOrizuruSequence）。
 */
export function GuestbookSheet({
  name,
  heading,
  placeholder,
  waitingLabel,
  sequence,
  compact = false,
  className,
}: GuestbookSheetProps) {
  const face = { name, heading, placeholder }
  const run = sequence.run
  return (
    <>
      <div
        ref={sequence.sheetRef}
        className={cn('oz-sheet wa-washi', className)}
        data-compact={compact || undefined}
        data-folding={run ? '' : undefined}
        aria-hidden="true"
      >
        <SheetFace {...face} live />
      </div>
      {run ? (
        <OrizuruStage
          key={run.id}
          variant={run.variant}
          outcome={run.outcome}
          sheetRef={sequence.sheetRef}
          face={face}
          waitingLabel={waitingLabel}
          onSettle={sequence.settle}
        />
      ) : null}
    </>
  )
}
