import { Route, Routes } from 'react-router'

function Home() {
  return (
    <main className="p-4">
      <h1 className="text-xl font-bold">would-you-marry.me</h1>
      <p>guest</p>
    </main>
  )
}

// ルート（画面）は T12 以降で追加する
export function App() {
  return (
    <Routes>
      <Route path="*" element={<Home />} />
    </Routes>
  )
}
