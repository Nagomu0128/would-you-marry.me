# ADR-0003: 開発ツールとリポジトリ構成

- ステータス: 承認
- 日付: 2026-10-20
- 関連: ADR-0001, ADR-0002, D-33 / [design/architecture.md](../design/architecture.md#リポジトリ構成)

## コンテキスト

- ADR-0001 で決めていなかった開発ツール（スタイリング、画面のルーティング、lint・format、テスト）と、リポジトリの構成を決める
- 2 つの Worker（guest / admin）で、DB スキーマ・共通の処理・画面部品を共有する
- 2026 年 10 月末の結婚式までに作る（D-33）

## 選択肢

| 論点 | 検討した選択肢 | 結論 |
|---|---|---|
| スタイリング | Tailwind CSS v4 / CSS Modules | Tailwind CSS v4。デザインガイドの色・文字・余白をテーマ（CSS 変数）として定義し、そのままクラスで使える |
| 画面のルーティング | React Router（ライブラリとして使う） / TanStack Router | React Router。SPA のルーティングだけに使い、サーバー側の処理は Hono で行う |
| lint・format | Biome / ESLint + Prettier | Biome。1 つの道具で lint と format ができ、設定が少ない |
| テスト | Vitest / Vitest + Playwright（E2E） | Vitest のみ。E2E テストは行わない（プロダクトオーナーの判断） |

## 決定

- スタイリングは Tailwind CSS v4。テーマは `packages/ui/src/theme/` に置く
- 画面のルーティングは React Router（ライブラリとして使う）
- lint・format は Biome。設定はルートの `biome.json` にまとめる
- テストは Vitest。Worker のテストは `@cloudflare/vitest-pool-workers` で、Workers の実行環境で動かす。E2E テストは行わない
- リポジトリは pnpm workspaces のモノレポにする。構成は [architecture.md](../design/architecture.md#リポジトリ構成) のとおり

## 影響

- E2E テストを行わない代わりに、次のことを Vitest で自動テストする
  - 期間の計算（[spec/tenant-periods.md](../spec/tenant-periods.md) の計算例と境界の時刻）
  - ニックネームのルール、投稿枚数の上限、いいねの数え直し
  - テナント間アクセスの拒否（[multi-tenancy.md](../design/multi-tenancy.md#テナント間アクセスの確認観点) の確認観点）
- ブラウザごとの表示と操作（Safari・Chrome・アプリ内ブラウザ）は、実機で確認する（NFR-02, NFR-25）
