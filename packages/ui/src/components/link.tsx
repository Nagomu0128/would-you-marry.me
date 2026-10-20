import type { ComponentType, MouseEventHandler, ReactNode } from 'react'

/**
 * packages/ui は react-router に依存しない。リンクを出す部品は `href` と `LinkComponent` を受け取る。
 * アプリ側は、例えば `({ href, ...rest }) => <Link to={href} {...rest} />` を渡す。
 */
export type LinkProps = {
  href: string
  className?: string
  children?: ReactNode
  onClick?: MouseEventHandler<HTMLAnchorElement>
  'aria-label'?: string
  'aria-current'?: 'page'
}

export type LinkComponent = ComponentType<LinkProps>

/** 既定のリンク（ふつうの `<a>`） */
export const DefaultLink: LinkComponent = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
)
