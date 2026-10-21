import { PageLoading, RouteBoundary } from '@wym/ui'
import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { AuthGate } from './components/AuthGate'
import { Login } from './screens/Login'

const Guests = lazy(() => import('./screens/Guests').then((module) => ({ default: module.Guests })))
const JoinUrls = lazy(() =>
  import('./screens/JoinUrls').then((module) => ({ default: module.JoinUrls })),
)
const Monitor = lazy(() =>
  import('./screens/Monitor').then((module) => ({ default: module.Monitor })),
)
const Photos = lazy(() => import('./screens/Photos').then((module) => ({ default: module.Photos })))
const Preview = lazy(() =>
  import('./screens/Preview').then((module) => ({ default: module.Preview })),
)
const TenantCreate = lazy(() =>
  import('./screens/TenantCreate').then((module) => ({ default: module.TenantCreate })),
)
const TenantDetail = lazy(() =>
  import('./screens/TenantDetail').then((module) => ({ default: module.TenantDetail })),
)
const TenantList = lazy(() =>
  import('./screens/TenantList').then((module) => ({ default: module.TenantList })),
)

/**
 * 管理面のルート。`AuthGate` の中の画面は、ログイン済みで許可された管理者だけが見られる。
 */
export function App() {
  return (
    <RouteBoundary>
      <Suspense fallback={<PageLoading className="layout-admin" />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AuthGate />}>
            <Route path="/" element={<TenantList />} />
            <Route path="/tenants/new" element={<TenantCreate />} />
            <Route path="/tenants/:tenantId" element={<TenantDetail />} />
            <Route path="/tenants/:tenantId/urls" element={<JoinUrls />} />
            <Route path="/tenants/:tenantId/photos" element={<Photos />} />
            <Route path="/tenants/:tenantId/preview" element={<Preview />} />
            <Route path="/tenants/:tenantId/guests" element={<Guests />} />
            <Route path="/monitor" element={<Monitor />} />
          </Route>
        </Routes>
      </Suspense>
    </RouteBoundary>
  )
}
