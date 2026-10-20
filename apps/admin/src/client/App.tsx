import { Route, Routes } from 'react-router'
import { AuthGate } from './components/AuthGate'
import { Guests } from './screens/Guests'
import { JoinUrls } from './screens/JoinUrls'
import { Login } from './screens/Login'
import { Monitor } from './screens/Monitor'
import { PhotosPlaceholder } from './screens/Placeholder'
import { Preview } from './screens/Preview'
import { TenantCreate } from './screens/TenantCreate'
import { TenantDetail } from './screens/TenantDetail'
import { TenantList } from './screens/TenantList'

/**
 * 管理面のルート。`AuthGate` の中の画面は、ログイン済みで許可された管理者だけが見られる。
 * SA-07（写真管理）は PhotosPlaceholder のまま。別のタスクで element を差し替える。
 */
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AuthGate />}>
        <Route path="/" element={<TenantList />} />
        <Route path="/tenants/new" element={<TenantCreate />} />
        <Route path="/tenants/:tenantId" element={<TenantDetail />} />
        <Route path="/tenants/:tenantId/urls" element={<JoinUrls />} />
        <Route path="/tenants/:tenantId/photos" element={<PhotosPlaceholder />} />
        <Route path="/tenants/:tenantId/preview" element={<Preview />} />
        <Route path="/tenants/:tenantId/guests" element={<Guests />} />
        <Route path="/monitor" element={<Monitor />} />
      </Route>
    </Routes>
  )
}
