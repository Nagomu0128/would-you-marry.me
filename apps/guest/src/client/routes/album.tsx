import { ja, ScreenHeader } from '@wym/ui'
import { useParams } from 'react-router'
import { paths, RouterLink } from '../lib/router-link'

// 仮の画面。SG-06（共有フォトアルバム）は T13 で、このファイルを置き換えて作る
export function AlbumRoute() {
  const { tenantId = '' } = useParams()
  return (
    <ScreenHeader
      title={ja.common.nav.album}
      backHref={paths.home(tenantId)}
      LinkComponent={RouterLink}
    />
  )
}
