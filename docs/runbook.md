# 運用手順書

本番（Cloudflare）の構築、デプロイ、障害時の戻し方、ログの見方をまとめる。
構成は [design/architecture.md](design/architecture.md)、採用技術は [ADR-0001](adr/0001-select-tech-stack.md) を参照。

- 最終更新: 2026-10-20
- 対象: プロダクトオーナー・オーケストレーター（本番を操作する人）

## 前提

| 項目 | 内容 |
|---|---|
| 基盤 | Cloudflare（Workers Paid プラン）、エラー監視は Sentry（D-32） |
| guest Worker | `wym-guest`。ドメインは `would-you-marry.me` |
| admin Worker | `wym-admin`。ドメインは `admin.would-you-marry.me`。Cron Triggers（UTC 18:00 = 日本時間 3:00）を持つ |
| D1 | `wym`（2 つの Worker で共有） |
| R2 | `wym-files`（2 つの Worker で共有。非公開） |
| 設定 | `apps/guest/wrangler.jsonc`・`apps/admin/wrangler.jsonc` の `env.production`。トップレベルの設定はローカル開発・テスト用で、本番には使わない |

Wrangler の環境では、バインディング（D1・R2・Rate Limiting）と `vars` がトップレベルから継承されない。そのため `env.production` に必要なものをすべて書いている。設定を足すときは、トップレベルと `env.production` の両方を更新する。

ビルドは `CLOUDFLARE_ENV=production vite build`（各 app の `build:production`）で本番の環境を選ぶ。出力された `dist/<worker 名>/wrangler.json` を `wrangler deploy` が使う。

以降のコマンドは、特に断りがなければリポジトリのルートで実行する。`wrangler` は各 app の依存なので、`pnpm --filter @wym/admin exec wrangler ...` の形で呼ぶ。

## 初回の構築

### 1. Cloudflare にログインする

```sh
pnpm --filter @wym/admin exec wrangler login
pnpm --filter @wym/admin exec wrangler whoami
```

### 2. ドメインを確認する

- `would-you-marry.me` が Cloudflare のゾーン（同じアカウント）として有効（Active）であることを、ダッシュボードの「Websites」で確認する
- Workers Custom Domains は、ゾーンにある同名の DNS レコードがあると設定に失敗する。`would-you-marry.me` と `admin.would-you-marry.me` に既存の DNS レコード（A・AAAA・CNAME）があれば削除する。DNS レコードと証明書は、デプロイ時に自動で作られる

### 3. D1 と R2 を作る

```sh
pnpm --filter @wym/admin exec wrangler d1 create wym
pnpm --filter @wym/admin exec wrangler r2 bucket create wym-files
```

`d1 create` の出力にある `database_id`（UUID）を控える。R2 のバケットは公開設定にしない（既定のまま）。

### 4. 設定ファイルの値を書き換える

| ファイル | キー | 置き換える値 |
|---|---|---|
| `apps/guest/wrangler.jsonc` の `env.production` | `d1_databases[0].database_id` | `<D1_DATABASE_ID>` → 手順 3 の `database_id` |
| 同上 | `vars.CONTACT_EMAIL` | `<CONTACT_EMAIL>` → 画面に表示する問い合わせ先（FR-G-15） |
| `apps/admin/wrangler.jsonc` の `env.production` | `d1_databases[0].database_id` | `<D1_DATABASE_ID>` → 手順 3 の `database_id` |
| 同上 | `vars.ADMIN_EMAILS` | `<ADMIN_EMAILS>` → 管理者の Google アカウントのメールアドレス（複数ならカンマ区切り。D-22） |

- `database_id` は秘密ではないので、書き換えたファイルはコミットしてよい
- `<...>` のまま残っていないことを確認する: `grep -n "<[A-Z_]*>" apps/*/wrangler.jsonc`

### 5. Google OAuth クライアントを作る

Google Cloud コンソールの「API とサービス」→「認証情報」で OAuth クライアント ID（種類: ウェブアプリケーション）を作る。

| 項目 | 値 |
|---|---|
| 承認済みの JavaScript 生成元 | `https://admin.would-you-marry.me` |
| 承認済みのリダイレクト URI | `https://admin.would-you-marry.me/api/auth/callback/google` |

OAuth 同意画面は、管理者のメールアドレスがテストユーザーに入っているか、公開済みにしておく。得られたクライアント ID とクライアントシークレットを次の手順で登録する。

### 6. シークレットを登録する

Worker がまだ存在しない場合、`secret put` は Worker の新規作成を確認してくる。迷うときは手順 8 の初回デプロイのあとに登録する（登録すると新しいバージョンが作られ、再デプロイは不要）。

```sh
# BETTER_AUTH_SECRET: 32 文字以上のランダムな値を生成して登録する
openssl rand -base64 32
pnpm --filter @wym/admin exec wrangler secret put BETTER_AUTH_SECRET --env production
pnpm --filter @wym/admin exec wrangler secret put GOOGLE_CLIENT_ID --env production
pnpm --filter @wym/admin exec wrangler secret put GOOGLE_CLIENT_SECRET --env production
pnpm --filter @wym/admin exec wrangler secret put SENTRY_DSN --env production
pnpm --filter @wym/guest exec wrangler secret put SENTRY_DSN --env production
```

- 値はプロンプトに貼り付ける（コマンドラインに書かない）
- `BETTER_AUTH_SECRET` を変えると、管理者のログイン状態がすべて無効になる
- Sentry を使わないうちは `SENTRY_DSN` の登録を省ける（空なら送信しない）

### 7. クライアントのビルド時の変数を用意する

画面側の Sentry と、管理面の「監視ツールへのリンク」は、ビルド時の環境変数（`VITE_` で始まる名前）で渡す。値は `.env.production` に書く。`.env.production` は git に入れない（`.gitignore` の `.env.*` で除外済み）。

```sh
# apps/guest/.env.production
VITE_SENTRY_DSN=https://<公開キー>@<組織>.ingest.sentry.io/<プロジェクト ID>

# apps/admin/.env.production
VITE_SENTRY_DSN=https://<公開キー>@<組織>.ingest.sentry.io/<プロジェクト ID>
VITE_MONITORING_URL=https://<管理面から開く監視ツールの URL>
```

- `VITE_` の値はビルド後の JavaScript に埋め込まれ、誰でも読める。Sentry の DSN は公開してよい値だが、秘密の値は入れない
- ファイルを使わずに、デプロイのコマンドの前に環境変数で渡してもよい（例: `VITE_SENTRY_DSN=... pnpm deploy:guest`）
- 未設定でもビルドとデプロイは成功する（画面側の Sentry は送信せず、監視ツールのリンクは Cloudflare のダッシュボードになる）

### 8. マイグレーションを適用してデプロイする

```sh
pnpm db:migrate:remote      # 本番の D1 にマイグレーションを適用
pnpm deploy:admin           # 本番の環境でビルドして admin Worker をデプロイ
pnpm deploy:guest           # 本番の環境でビルドして guest Worker をデプロイ
```

- `db:migrate:remote` は、適用するマイグレーションの一覧を表示して確認を求める。内容を見てから `y` と答える
- デプロイの前に、実際にアップロードせずに内容を確かめるには、`pnpm --filter @wym/admin build:production` のあとに `pnpm --filter @wym/admin exec wrangler deploy --dry-run` を実行する
- 初回のデプロイで Custom Domain が作られる。証明書の発行に数分かかることがある

### 9. デプロイ後の確認

1. `https://admin.would-you-marry.me` を開き、許可リストの Google アカウントでログインできる。許可リストにないアカウントではログインできない
2. テナントを作成できる（開催日・会場名などを入力して保存）
3. 参加 URL と QR コードを発行できる
4. スマートフォンで参加 URL を開いて参加できる（`https://would-you-marry.me/join/...`）。参加受付期間外のテナントは参加できないので、確認用のテナントは開催日を当日に設定する
5. 参加後、ニックネームの入力と写真のアップロードができ、管理面で見える
6. 確認用に作ったテナントは、管理面から削除する（写真も R2 から消える）
7. Cloudflare ダッシュボードの Workers → `wym-admin` → 「Triggers」に Cron `0 18 * * *` がある

## 2 回目以降のデプロイ

```sh
git switch main && git pull
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm db:migrate:remote      # マイグレーションの追加があるときだけ
pnpm deploy:admin
pnpm deploy:guest
```

- 画面や API の変更だけなら、変更のあった Worker だけデプロイすればよい。共有のパッケージ（`packages/`）を変えたときは両方デプロイする
- マイグレーションがあるときは、先にマイグレーション、次にデプロイの順にする。古いコードで動くよう、列の追加のように後方互換な変更にする
- デプロイは、メンテナンスの扱いとして「参加受付期間中のテナントがない時間帯」に行う（下記）

## マイグレーションの追加

1. `packages/db/src/schema/` を変更する
2. `pnpm db:generate` で `packages/db/migrations/` に SQL を生成する
3. `pnpm db:migrate:local` でローカルに適用し、`pnpm test` で確かめる
4. 生成された SQL をコミットする
5. 本番には `pnpm db:migrate:remote` で適用する（未適用のものだけが適用される）

- 本番の D1 の適用済みの一覧は `pnpm --filter @wym/admin exec wrangler d1 migrations list wym --remote --env production` で確かめる
- 適用済みのマイグレーションのファイルは書き換えない。直すときは新しいマイグレーションを足す
- バックアップは取らない方針（D-31、NFR-22）。データを破壊する変更（列・表の削除）は、適用前に必要なデータがないことを確かめる

## ロールバック

Worker のコードは、直前のバージョンに戻せる。

```sh
pnpm --filter @wym/admin exec wrangler deployments list --env production    # 履歴を見る
pnpm --filter @wym/admin exec wrangler rollback --env production            # 直前のバージョンに戻す
pnpm --filter @wym/guest exec wrangler rollback --env production
```

- 特定のバージョンに戻すときは `wrangler rollback <バージョン ID> --env production`
- `rollback` は Worker のコードと設定だけを戻す。D1 のマイグレーションは戻らない。マイグレーションを含むデプロイを戻すときは、戻したコードが新しいスキーマで動くか確かめる。動かない場合は、修正した新しいバージョンをデプロイする（前に進んで直す）
- シークレットの変更もバージョンに含まれる。直前の値に戻したいときは、シークレットを登録し直す

## ログの見方

- Cloudflare ダッシュボードの Workers → 対象の Worker → 「Observability」（Workers Logs）で見る。`wym-guest` と `wym-admin` で別々に見る
- ログにはテナント ID を付けている（NFR-18）。ログは JSON 1 行で、テナント ID は `tenantId` フィールドに入る。Workers Logs のクエリで `tenantId` が対象のテナント ID（管理面のテナント詳細で確かめる）に等しいものに絞り込む。`event`・`code`・`status` でもさらに絞り込める
- 個人情報（写真・ニックネーム・メールアドレス・パスコード・トークン・セッション ID）はログに出さない。ログから個人を特定しようとしない
- リアルタイムで見るには `pnpm --filter @wym/guest exec wrangler tail --env production`（ログはその場で流れるだけで残らない）
- エラーは Sentry に送られる（`SENTRY_DSN` を登録している場合）。管理面の「監視ツールへのリンク」は `VITE_MONITORING_URL` で決まる

## メンテナンスの時間帯

NFR-09 により、参加受付期間中のテナント（開催日当日〜翌日。[spec/tenant-periods.md](spec/tenant-periods.md)）がある時間帯に、デプロイ・マイグレーション・ロールバック以外の設定変更を行わない。

- 管理面のテナント一覧で、メンテナンスの時間帯に参加受付期間中のテナントがないことを確かめてから行う
- Cron Triggers の定期処理は、日本時間の 3:00（UTC 18:00）に動く。この時刻の前後は、メンテナンスを避ける
- 参加受付期間中に不具合が見つかり、やむを得ず修正をデプロイするときは、変更を最小にして、デプロイ後にすぐ参加と写真のアップロードを確かめる
