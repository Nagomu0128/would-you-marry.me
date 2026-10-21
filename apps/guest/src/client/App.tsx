import { MotionProvider, ToastProvider } from '@wym/ui'
import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { NavLayout, PlainLayout } from './layouts'
import { ConfigProvider } from './lib/config'
import { errorPagePath } from './lib/error-handling'
import { ErrorRoute } from './routes/error'
import { HomeRoute } from './routes/home'
import { LegalRoute } from './routes/legal'
import { NicknameRoute } from './routes/nickname'

const AlbumRoute = lazy(() =>
  import('./routes/album').then((module) => ({ default: module.AlbumRoute })),
)
const CoupleLoginRoute = lazy(() =>
  import('./routes/couple-login').then((module) => ({ default: module.CoupleLoginRoute })),
)
const CouplePhotosRoute = lazy(() =>
  import('./routes/couple-photos').then((module) => ({ default: module.CouplePhotosRoute })),
)
const MenuRoute = lazy(() =>
  import('./routes/menu').then((module) => ({ default: module.MenuRoute })),
)
const SeatingRoute = lazy(() =>
  import('./routes/seating').then((module) => ({ default: module.SeatingRoute })),
)
const UploadRoute = lazy(() =>
  import('./routes/upload').then((module) => ({ default: module.UploadRoute })),
)

// 画面のルート（docs/spec/api.md「画面のルート（SPA）」）。
// 下部ナビゲーションがあるのは NavLayout の中（SG-03〜SG-07）だけ。
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/t/:tenantId">
        <Route path="nickname" element={<PlainLayout />}>
          <Route index element={<NicknameRoute />} />
        </Route>
        <Route element={<NavLayout />}>
          <Route index element={<HomeRoute />} />
          <Route path="seating" element={<SeatingRoute />} />
          <Route path="menu" element={<MenuRoute />} />
          <Route path="album" element={<AlbumRoute />} />
          <Route path="upload" element={<UploadRoute />} />
        </Route>
      </Route>
      <Route element={<PlainLayout />}>
        <Route path="/couple/:tenantId/login" element={<CoupleLoginRoute />} />
        <Route path="/couple/:tenantId/photos" element={<CouplePhotosRoute />} />
        <Route path="/error" element={<ErrorRoute />} />
        <Route path="/terms" element={<LegalRoute kind="terms" />} />
        <Route path="/privacy" element={<LegalRoute kind="privacy" />} />
        <Route path="*" element={<Navigate to={errorPagePath('TENANT_NOT_FOUND')} replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <MotionProvider>
      <ToastProvider>
        <ConfigProvider>
          <AppRoutes />
        </ConfigProvider>
      </ToastProvider>
    </MotionProvider>
  )
}
