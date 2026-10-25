import { createReadStream } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

/** PDF.js の同梱 CMap を開発サーバーと本番ビルドの両方で配信する。 */
export function pdfCmaps(configUrl: string) {
  const require = createRequire(configUrl)
  const directory = resolve(
    dirname(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')),
    '../../cmaps',
  )
  const prefix = '/pdfjs-cmaps/'

  return {
    name: 'pdfjs-cmaps',
    configureServer(server: {
      middlewares: {
        use: (
          handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void,
        ) => void
      }
    }) {
      server.middlewares.use((req, res, next) => {
        const filename = req.url?.split('?')[0]?.slice(prefix.length)
        if (!req.url?.startsWith(prefix) || !filename || !/^[\w-]+\.bcmap$/.test(filename)) {
          next()
          return
        }
        res.setHeader('Content-Type', 'application/octet-stream')
        const stream = createReadStream(join(directory, filename))
        stream.on('error', () => {
          if (!res.headersSent) next()
          else res.destroy()
        })
        stream.pipe(res)
      })
    },
    async generateBundle(this: {
      emitFile: (asset: { type: 'asset'; fileName: string; source: Uint8Array }) => void
    }) {
      for (const filename of await readdir(directory)) {
        if (!filename.endsWith('.bcmap')) continue
        this.emitFile({
          type: 'asset',
          fileName: `pdfjs-cmaps/${filename}`,
          source: await readFile(join(directory, filename)),
        })
      }
    },
  }
}
