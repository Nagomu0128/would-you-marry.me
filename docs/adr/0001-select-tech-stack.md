# ADR-0001: 技術スタックの選定

- ステータス: 承認
- 日付: 2026-10-20
- 関連: D-12, D-20, D-22, D-24, D-25, D-31, D-32, D-33 / [design/architecture.md](../design/architecture.md)

## コンテキスト

- 基盤は Cloudflare（Workers Paid プラン）とし、一部に他のサービスを併用する（D-32）。運用コストは制約にしない
- 2026 年 10 月末の結婚式までに、現在の要件をすべて作る（D-33）
- 画面は 3 つ（ユーザー画面・新郎新婦用ページ・管理面）。管理面は別のオリジンで提供する（[multi-tenancy.md](../design/multi-tenancy.md)）
- 参加者は匿名認証、新郎新婦は専用 URL + パスコード、管理者は Google ログイン + 許可リスト（[auth.md](../design/auth.md)）
- 写真はオリジナルのまま 1 枚 10MB まで。位置情報は取り除く。リアルタイム反映は不要（D-12, D-25, D-24）

## 選択肢

| 論点 | 検討した選択肢 | 結論 |
|---|---|---|
| 画面と API | Hono + React（Vite） / React Router v7 / Next.js（OpenNext） | Hono + React。検索対応が不要なので SPA で十分。Next.js は Workers 上では OpenNext 経由になり設定と制約が増える |
| 管理者の認証 | Better Auth / Cloudflare Access / Worker で自前実装 | Better Auth。認証をアプリケーション内にまとめ、Cloudflare の管理画面の設定に頼らない |
| 参加者・新郎新婦のセッション | 自前（Cookie + D1） / Better Auth の匿名プラグイン / Firebase Authentication | 自前。テナントへの紐づけ、参加トークン・パスコードの条件をそのまま書ける。他の案ではいずれもカスタマイズが必要 |
| 画像処理 | 縮小はブラウザ・位置情報の除去は Worker / 縮小は Cloudflare Images / すべてブラウザ | 縮小はブラウザ、除去は Worker。追加のサービスが不要で、位置情報の除去はサーバー側で確実に行える |
| 写真の配信 | Worker 経由 / R2 の署名付き URL | Worker 経由。認可の確認を Worker に一元化できる。R2 は転送量の課金がない |
| 併用するサービス | Sentry / Firebase Authentication / なし | Sentry（エラー監視）のみ |

## 決定

| 項目 | 採用 | 理由 |
|---|---|---|
| 言語 | TypeScript | 画面とサーバーで型を共有できる |
| 画面 | React（Vite でビルドする SPA） | 検索対応が不要。ユーザー画面はセッションの後ろにある |
| API | Hono | Workers 向けに軽量。セッション・テナント・期間の検証をミドルウェアにまとめられる |
| 実行環境・配信 | Cloudflare Workers（静的アセット配信、Cloudflare Vite プラグイン） | 画面と API を 1 つの Worker に同居させる |
| データベース | D1 + Drizzle ORM | ランキングなどを SQL で集計しやすい。Drizzle は D1 と Better Auth の両方に対応する |
| ファイル保存 | R2（非公開バケット） | 転送量の課金がない |
| 管理者の認証 | Better Auth（Google ログインのみ） | 許可リストは環境変数で管理する（D-22） |
| 参加者・新郎新婦のセッション | 自前（HttpOnly Cookie + D1） | 上記のとおり |
| 画像処理 | 縮小画像はブラウザで生成、位置情報の除去は Worker | 上記のとおり |
| 席次表 PDF の表示 | PDF.js | iPhone の Safari では、ページに埋め込んだ PDF が最初のページしか表示されないことがあるため |
| 写真の保存 | Web Share API（ファイルの共有）、使えない端末ではダウンロード | iPhone では共有メニューの「画像を保存」から写真アプリに保存できる |
| QR コードの生成 | 管理画面（ブラウザ）で生成するライブラリ | — |
| 定期処理 | Cron Triggers（1 日 1 回） | データの自動削除（FR-A-13） |
| ログ | Workers Logs（テナント ID を含む構造化ログ） | 外部の監視ツール（D-20）として使う |
| エラー監視 | Sentry（Worker とブラウザ） | 当日のエラーに気付けるようにする |
| リポジトリ構成 | pnpm workspaces のモノレポ | 2 つの Worker で DB スキーマと共通の処理を共有する |
| ドメイン | Workers Custom Domains（ゲスト用 `would-you-marry.me`、管理用 `admin.would-you-marry.me`） | DNS レコードと証明書を Cloudflare が管理する。ユーザー指定 |
| デプロイ | Wrangler（Cloudflare の CLI）。D1 のマイグレーションとシークレットの登録も Wrangler で行う | ユーザー指定 |

構成と処理方式の詳細は [design/architecture.md](../design/architecture.md) に記載する。

## 影響

- 管理者のアカウントとログイン状態は、Better Auth が管理する表として D1 に保存する。許可リストは引き続き環境変数で管理する（D-22）
- Worker を 2 つ（ゲスト用・管理用）に分け、同じ D1 と R2 を共有する
- Sentry には写真・ニックネームなどの個人情報を送らない。送るのはテナント ID とエラーの内容だけにする
- UI はモバイルファーストで作り、Safari・Chrome など複数のブラウザで動作を確認する（NFR-02, NFR-24）
- 次のことを、実装の最初に検証する（[architecture.md](../design/architecture.md#早めに検証すること)）
  - iPhone から写真をアップロードしたときのファイル形式（HEIC か JPEG か）
  - Worker で 10MB の写真から、再圧縮せずに位置情報を取り除けること。写真の向きが保たれること
  - PDF.js で席次表 PDF をスマートフォンで読めること
  - Web Share API で、iPhone・Android の写真アプリに保存できること
  - Better Auth の Google ログインが Workers + D1 で動くこと
  - LINE などのアプリ内ブラウザで、参加・アップロード・保存が動くこと
