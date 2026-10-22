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

/** ページの末尾に置く、控えめなリンクの列。利用規約 / プライバシーポリシー / お問い合わせ。 */
export function Footer({
  termsHref,
  privacyHref,
  contactEmail,
  LinkComponent: Link = DefaultLink,
  className,
}: FooterProps) {
  return (
    <footer className={cn('app-footer', className)}>
      <span className="footer-rule" aria-hidden="true" />
      <nav aria-label={ja.common.footerLabel}>
        <ul className="footer-links">
          <li>
            <Link href={termsHref}>{ja.common.footer.terms}</Link>
          </li>
          <li>
            <Link href={privacyHref}>{ja.common.footer.privacy}</Link>
          </li>
          {contactEmail ? (
            <li>
              <a href={`mailto:${contactEmail}`}>{ja.common.footer.contact}</a>
            </li>
          ) : null}
        </ul>
      </nav>
    </footer>
  )
}
