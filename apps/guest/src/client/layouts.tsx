import { BottomNav, type BottomNavKey, Footer, PageTransition } from '@wym/ui'
import type { ReactNode } from 'react'
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
  return <PageTransition key={pathname}>{children}</PageTransition>
}

/** 下部ナビゲーションのない画面（SG-02、SG-E1、規約、新郎新婦用ページ） */
export function PlainLayout() {
  return (
    <div className="screen-h layout-guest flex flex-col safe-bottom">
      <main className="flex-1">
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
      <div className="screen-h layout-guest flex flex-col pb-[calc(var(--spacing-nav)+env(safe-area-inset-bottom))]">
        <main className="flex-1">
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
