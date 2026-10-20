import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  // D1 のマイグレーションは packages/db が持つ。テストの開始時に適用する（test/apply-migrations.ts）
  const migrations = await readD1Migrations(
    path.join(import.meta.dirname, '../../packages/db/migrations'),
  )

  return {
    test: {
      projects: [
        {
          // Worker の結合テスト（Workers の実行環境で動かす）
          plugins: [
            cloudflareTest({
              wrangler: { configPath: './wrangler.jsonc' },
              miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
            }),
          ],
          test: {
            name: 'worker',
            include: ['test/**/*.test.ts', 'src/worker/**/*.test.ts'],
            setupFiles: ['./test/apply-migrations.ts'],
          },
        },
        {
          // 画面の単体テスト
          test: {
            name: 'client',
            environment: 'happy-dom',
            include: ['src/client/**/*.test.{ts,tsx}'],
            setupFiles: ['./src/client/test-setup.ts'],
          },
        },
      ],
    },
  }
})
