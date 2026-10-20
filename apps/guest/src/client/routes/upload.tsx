import { ja, ScreenHeader } from '@wym/ui'
import { useParams } from 'react-router'
import { paths, RouterLink } from '../lib/router-link'

// 仮の画面。SG-07（フォトアップロード）は T14 で、このファイルを置き換えて作る
export function UploadRoute() {
  const { tenantId = '' } = useParams()
  return (
    <ScreenHeader
      title={ja.guest.upload.heading}
      backHref={paths.home(tenantId)}
      LinkComponent={RouterLink}
    />
  )
}
