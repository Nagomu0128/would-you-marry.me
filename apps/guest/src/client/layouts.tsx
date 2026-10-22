import {
  BottomNav,
  type BottomNavKey,
  Brand,
  Footer,
  ja,
  PageLoading,
  PageTransition,
  RouteBoundary,
} from '@wym/ui'
import { type ReactNode, Suspense, useEffect } from 'react'
import { Outlet, useLocation, useParams } from 'react-router'
import { useContactEmail } from './lib/config'
import { paths, RouterLink } from './lib/router-link'

function AppFooter() {
  const contactEmail = useContactEmail()
  return (
    <Footer
      termsHref={paths.terms}
      privacyHref={paths.privacy}
      {...(contactEmail ? { contactEmail } : {})}
      LinkComponent={RouterLink}
    />
  )
}

function Page({ children }: { children: ReactNode }) {
  // 画面（パス）が変わったときだけ切り替えの動きを付ける。?tab= などの変更では動かさない
  const { pathname } = useLocation()
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new page starts at its heading; tab changes retain scroll
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return (
    <RouteBoundary key={pathname}>
      <Suspense fallback={<PageLoading />}>
        <PageTransition key={pathname}>{children}</PageTransition>
      </Suspense>
    </RouteBoundary>
  )
}

/**
 * 一枚の紙（参加者・新郎新婦の画面の外枠）。上端は小さな水引と金の細罫だけの静かな帯、
 * 下端は控えめなリンク。48rem 以上では、紙の外側を臙脂と青海波の卓にする（guest.css）。
 */
function Sheet({ withNav = false }: { withNav?: boolean }) {
  return (
    <div className="guest-table">
      <div className="guest-sheet" data-nav={withNav || undefined}>
        <a href="#main-content" className="skip-link">
          {ja.common.skipToContent}
        </a>
        <div className="guest-band">
          <Brand />
        </div>
        <main id="main-content" tabIndex={-1} className="guest-main">
          <Page>
            <Outlet />
          </Page>
        </main>
        <AppFooter />
      </div>
    </div>
  )
}

/** 下部ナビゲーションのない画面（SG-02、SG-E1、規約、新郎新婦用ページ） */
export function PlainLayout() {
  return <Sheet />
}

function currentNavKey(pathname: string): BottomNavKey | undefined {
  const last = pathname.replace(/\/+$/, '').split('/').pop()
  switch (last) {
    case 'album':
      return 'album'
    case 'upload':
      return 'upload'
    case 'seating':
      return 'seating'
    case 'menu':
      return 'course'
    default:
      return /^\/t\/[^/]+\/?$/.test(pathname) ? 'home' : undefined
  }
}

/** 下部ナビゲーションのある画面（SG-03〜SG-07） */
export function NavLayout() {
  const { tenantId = '' } = useParams()
  const { pathname } = useLocation()
  const current = currentNavKey(pathname)
  return (
    <>
      <Sheet withNav />
      <BottomNav
        {...(current ? { current } : {})}
        hrefs={{
          home: paths.home(tenantId),
          album: paths.album(tenantId),
          upload: paths.upload(tenantId),
          seating: paths.seating(tenantId),
          course: paths.menu(tenantId),
        }}
        LinkComponent={RouterLink}
      />
    </>
  )
}
