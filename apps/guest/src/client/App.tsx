import { MotionProvider, ToastProvider } from '@wym/ui'
import { Navigate, Route, Routes } from 'react-router'
import { NavLayout, PlainLayout } from './layouts'
import { ConfigProvider } from './lib/config'
import { errorPagePath } from './lib/error-handling'
import { AlbumRoute } from './routes/album'
import { CoupleLoginRoute } from './routes/couple-login'
import { CouplePhotosRoute } from './routes/couple-photos'
import { ErrorRoute } from './routes/error'
import { HomeRoute } from './routes/home'
import { LegalRoute } from './routes/legal'
import { MenuRoute } from './routes/menu'
import { NicknameRoute } from './routes/nickname'
import { SeatingRoute } from './routes/seating'
import { UploadRoute } from './routes/upload'

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
