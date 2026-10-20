import type { LinkComponent } from '@wym/ui'
import { Link } from 'react-router'

/** @wym/ui の部品に渡す、React Router 用のリンク */
export const RouterLink: LinkComponent = ({ href, children, ...rest }) => (
  <Link to={href} {...rest}>
    {children}
  </Link>
)

export const paths = {
  home: (tenantId: string) => `/t/${encodeURIComponent(tenantId)}`,
  nickname: (tenantId: string) => `/t/${encodeURIComponent(tenantId)}/nickname`,
  seating: (tenantId: string) => `/t/${encodeURIComponent(tenantId)}/seating`,
  menu: (tenantId: string) => `/t/${encodeURIComponent(tenantId)}/menu`,
  album: (tenantId: string) => `/t/${encodeURIComponent(tenantId)}/album`,
  upload: (tenantId: string) => `/t/${encodeURIComponent(tenantId)}/upload`,
  terms: '/terms',
  privacy: '/privacy',
}
