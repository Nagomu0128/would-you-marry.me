import { ja } from '@wym/ui'
import { useParams } from 'react-router'
import { Screen } from '../components/shell'

// T17 で SA-07・SA-08・SA-09 の本体に置き換える仮の画面。
// 置き換えるときは、このファイルの export を残したまま中身を差し替えるか、
// App.tsx のルートの element を新しい画面に変える。
function Placeholder({ title }: { title: string }) {
  const { tenantId } = useParams()
  return (
    <Screen title={title} backHref={`/tenants/${tenantId ?? ''}`}>
      {null}
    </Screen>
  )
}

/** SA-07 写真管理（仮） */
export const PhotosPlaceholder = () => <Placeholder title={ja.admin.detail.photos} />
/** SA-08 参加者画面のプレビュー（仮） */
export const PreviewPlaceholder = () => <Placeholder title={ja.admin.detail.preview} />
/** SA-09 参加者管理（仮） */
export const GuestsPlaceholder = () => <Placeholder title={ja.admin.detail.guests} />
