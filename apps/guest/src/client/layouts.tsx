import {
  BottomNav,
  type BottomNavKey,
  Brand,
  Footer,
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

/** 下部ナビゲーションのない画面（SG-02、SG-E1、規約、新郎新婦用ページ） */
export function PlainLayout() {
  return (
    <div className="screen-h layout-guest guest-shell flex flex-col safe-bottom">
      <a href="#main-content" className="skip-link">
        本文へ移動
      </a>
      <header className="guest-masthead">
        <Brand />
        <span className="eyebrow" lang="en">
          Made of
          <br />
          your moments
        </span>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1">
        <Page>
          <Outlet />
        </Page>
      </main>
      <AppFooter />
    </div>
  )
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
      <div className="screen-h layout-guest guest-shell guest-with-nav flex flex-col">
        <a href="#main-content" className="skip-link">
          本文へ移動
        </a>
        <header className="guest-masthead">
          <Brand />
          <span className="eyebrow" lang="en">
            Made of
            <br />
            your moments
          </span>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1">
          <Page>
            <Outlet />
          </Page>
        </main>
        <AppFooter />
      </div>
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
