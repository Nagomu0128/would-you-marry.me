import { ja } from '@wym/ui'
import { useParams } from 'react-router'
import { Screen } from '../components/shell'

// SA-07 の本体ができるまでの仮の画面（SA-08・SA-09 は Preview.tsx・Guests.tsx に置き換え済み）。
// 置き換えるときは、App.tsx のルートの element を新しい画面に変え、このファイルを削除する。
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
