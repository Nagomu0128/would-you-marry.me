import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { pdfCmaps } from '../../scripts/vite-pdf-cmaps'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    pdfCmaps(import.meta.url),
    cloudflare({
      // guest と admin で同じ D1・R2 のローカル状態を使う（リポジトリ直下の .wrangler/state）
      persistState: { path: '../../.wrangler/state' },
    }),
  ],
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
})
