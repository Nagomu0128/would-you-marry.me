import { ja, ScreenHeader } from '@wym/ui'

// 仮の画面。SC-01（パスコード入力）は T15 で、このファイルを置き換えて作る
export function CoupleLoginRoute() {
  return <ScreenHeader title={ja.couple.entry.heading} />
}
