// guest と admin の開発サーバーを起動する。
//
// 2 つの Worker はローカルの D1（SQLite）を共有する（.wrangler/state）。
// 同時に起動すると、2 つの workerd が同じ SQLite ファイルを開こうとして
// SQLITE_BUSY で起動に失敗することがあるため、admin の起動を待ってから guest を起動する。
import { spawn } from 'node:child_process'

const ADMIN_URL = 'http://localhost:5174/'
const TIMEOUT_MS = 120_000

const children = []

function run(filter) {
  const child = spawn('pnpm', ['--filter', filter, 'dev'], { stdio: 'inherit' })
  children.push(child)
  child.on('exit', (code) => {
    // どちらかが止まったら、もう一方も止める
    shutdown(code ?? 1)
  })
  return child
}

let closing = false
function shutdown(code) {
  if (closing) return
  closing = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 500)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

async function waitForServer(url) {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline && !closing) {
    try {
      await fetch(url)
      return true
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }
  return false
}

run('@wym/admin')
if (await waitForServer(ADMIN_URL)) {
  run('@wym/guest')
} else {
  console.error('admin の開発サーバーが起動しませんでした')
  shutdown(1)
}
