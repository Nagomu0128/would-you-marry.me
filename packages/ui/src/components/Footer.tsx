import { ja } from '../messages/ja'
import { cn } from './cn'
import { DefaultLink, type LinkComponent } from './link'

export type FooterProps = {
  termsHref: string
  privacyHref: string
  /** お問い合わせ先のメールアドレス（`mailto:` のリンクにする）。取得前・未設定のときは渡さず、リンクを出さない */
  contactEmail?: string
  LinkComponent?: LinkComponent
  className?: string
}

/** ページの末尾に置く。利用規約 / プライバシーポリシー / お問い合わせ。 */
export function Footer({
  termsHref,
  privacyHref,
  contactEmail,
  LinkComponent: Link = DefaultLink,
  className,
}: FooterProps) {
  return (
    <footer className={cn('app-footer px-screen', className)}>
      <p className="footer-signature" lang="en">
        With love, for this day.
      </p>
      <nav className="footer-links" aria-label="ご利用について">
        <Link href={termsHref}>{ja.common.footer.terms}</Link>
        <Link href={privacyHref}>{ja.common.footer.privacy}</Link>
        {contactEmail ? <a href={`mailto:${contactEmail}`}>{ja.common.footer.contact}</a> : null}
      </nav>
    </footer>
  )
}
