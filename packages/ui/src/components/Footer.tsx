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

const linkClass =
  'inline-flex min-h-tap items-center px-2 text-caption text-warm-gray underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-champagne'

/** ページの末尾に置く。利用規約 / プライバシーポリシー / お問い合わせ。 */
export function Footer({
  termsHref,
  privacyHref,
  contactEmail,
  LinkComponent: Link = DefaultLink,
  className,
}: FooterProps) {
  return (
    <footer className={cn('px-screen py-6', className)}>
      <nav className="flex flex-wrap items-center justify-center gap-x-2">
        <Link href={termsHref} className={linkClass}>
          {ja.common.footer.terms}
        </Link>
        <Link href={privacyHref} className={linkClass}>
          {ja.common.footer.privacy}
        </Link>
        {contactEmail ? (
          <a href={`mailto:${contactEmail}`} className={linkClass}>
            {ja.common.footer.contact}
          </a>
        ) : null}
      </nav>
    </footer>
  )
}
