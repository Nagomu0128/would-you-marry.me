# would-you-marry.me

結婚式当日に、参加者がスマートフォンで写真を共有するための Web アプリ（マルチテナント）。
要件・設計は [docs/](docs/README.md) にある。実装の進め方は [docs/implementation-plan.md](docs/implementation-plan.md)。

## 構成

pnpm workspaces のモノレポ（[ADR-0003](docs/adr/0003-dev-tools-and-repository-layout.md)）。

| パス | パッケージ | 内容 |
|---|---|---|
| `apps/guest` | `@wym/guest` | guest Worker（ユーザー画面・新郎新婦用ページ・API）。開発サーバーは 5173 |
| `apps/admin` | `@wym/admin` | admin Worker（管理面・API・Better Auth・Cron Triggers）。開発サーバーは 5174 |
| `packages/shared` | `@wym/shared` | 画面とサーバーで共有する処理（エラーコードなど） |
| `packages/db` | `@wym/db` | Drizzle のスキーマとマイグレーション |
| `packages/ui` | `@wym/ui` | 画面部品・テーマ・文言・モーション |

`packages/*` はビルドせず、TypeScript のソースをそのまま参照する。依存は `apps` → `packages` の一方向。

## セットアップ

必要なもの: Node.js 22 以上（`.node-version` は 24）、pnpm 11 系。

```sh
pnpm install
cp apps/guest/.dev.vars.example apps/guest/.dev.vars   # 必要なら値を入れる
cp apps/admin/.dev.vars.example apps/admin/.dev.vars   # 必要なら値を入れる
pnpm db:migrate:local
```

## 開発サーバー

```sh
pnpm dev
```

- guest: http://localhost:5173
- admin: http://localhost:5174

2 つの Worker は、ローカルでも同じ D1・R2 の状態（リポジトリ直下の `.wrangler/state`）を使う。
同時に起動すると SQLite のロックで失敗することがあるため、`pnpm dev`（`scripts/dev.mjs`）は
admin が起動してから guest を起動する。片方だけ起動するときは `pnpm --filter @wym/guest dev` のようにする。
ローカルの状態を消すときは `.wrangler/state` を削除して、`pnpm db:migrate:local` をやり直す。

## データベースのマイグレーション

```sh
pnpm db:generate        # packages/db/src/schema/ の変更から SQL を packages/db/migrations/ に生成
pnpm db:migrate:local   # admin の Wrangler 設定から、ローカルの D1（.wrangler/state）に適用
```

マイグレーションは 2 つの Worker で共有するため、admin の `wrangler.jsonc`（`migrations_dir`）から適用する。

## コマンド

| コマンド | 内容 |
|---|---|
| `pnpm dev` | guest と admin の開発サーバーを起動 |
| `pnpm build` | すべてのパッケージをビルド |
| `pnpm typecheck` | すべてのパッケージの型検査 |
| `pnpm test` | すべてのパッケージのテスト（Vitest）。E2E テストは行わない |
| `pnpm lint` | Biome で lint と書式の確認（`biome check .`） |
| `pnpm format` | Biome で整形と自動修正（`biome check --write .`） |
| `pnpm db:generate` | Drizzle のマイグレーション SQL を生成 |
| `pnpm db:migrate:local` | ローカルの D1 にマイグレーションを適用 |
| `pnpm db:migrate:remote` | 本番の D1 にマイグレーションを適用（[運用手順書](docs/runbook.md)） |
| `pnpm deploy:guest` / `pnpm deploy:admin` | 本番の環境でビルドして、guest / admin Worker をデプロイ（[運用手順書](docs/runbook.md)） |

各 app で `pnpm --filter @wym/guest cf-typegen` のように実行すると、`wrangler.jsonc` を変えたあとの
Worker の型（`worker-configuration.d.ts`）を再生成できる。

## テスト

- 単体テストはコードの隣（`*.test.ts` / `*.test.tsx`）、Worker の結合テストは各 app の `test/` に置く
- Worker とデータベースのテストは Workers の実行環境（`@cloudflare/vitest-plugin`）で動かし、D1 に `packages/db/migrations` を適用してから実行する
- 画面のテストは happy-dom と Testing Library で動かす

## シークレット

`.dev.vars.example` に名前だけを書いている。ローカルは `.dev.vars`（git に入れない）、本番は `wrangler secret put` で登録する。本番の構築・デプロイの手順は [docs/runbook.md](docs/runbook.md) にある。
