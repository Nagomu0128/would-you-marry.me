# データベース設計（D1・R2）

[ドメインモデル](../design/domain-model.md) を、D1（SQLite）の表と R2 のキーに落とし込む。

## 方針

- スキーマは Drizzle ORM で定義する。マイグレーションは drizzle-kit で SQL を生成し、`wrangler d1 migrations apply` で適用する
- 表名・列名は snake_case
- ID は UUID v4 を TEXT で持つ（`crypto.randomUUID()`）
- 日時は UNIX 時間のミリ秒（UTC）を INTEGER で持つ。開催日だけは `YYYY-MM-DD`（日本時間の日付）の TEXT
- 真偽値は INTEGER（0 / 1）
- 外部キー制約を定義する（D1 で制約が効いていることを実装時に確認する）
- テナントスコープの表はすべて `tenant_id` を持ち、クエリは必ず `tenant_id` で絞り込む（[multi-tenancy.md](../design/multi-tenancy.md) の P3）

## 表の一覧

| 表 | 内容 | エンティティ |
|---|---|---|
| `tenants` | テナント | Tenant |
| `join_tokens` | 参加トークン | JoinToken |
| `couple_accesses` | 新郎新婦用トークンとパスコード | CoupleAccess |
| `seating_charts` | 席次表 PDF | SeatingChart |
| `course_menu_images` | 料理のコース表の画像 | CourseMenuImage |
| `guests` | 参加者 | Guest |
| `photos` | 写真 | Photo |
| `likes` | いいね | Like |
| `visitor_sessions` | 参加者・新郎新婦のセッション | — |
| `audit_logs` | 管理操作の記録（NFR-19） | — |
| `auth_user` / `auth_session` / `auth_account` / `auth_verification` | 管理者の認証（Better Auth） | — |

## 表の定義

### tenants

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | TEXT | PK | UUID v4 |
| `name` | TEXT | NOT NULL | 結婚式の表示名（1〜50 文字、仮置き） |
| `event_date` | TEXT | NOT NULL | 開催日（`YYYY-MM-DD`、日本時間） |
| `suspended` | INTEGER | NOT NULL DEFAULT 0 | 手動停止 |
| `created_by` | TEXT | NOT NULL | 作成した管理者のメールアドレス |
| `created_at` | INTEGER | NOT NULL | |
| `updated_at` | INTEGER | NOT NULL | |
| `data_deleted_at` | INTEGER | NULL | データを削除した日時 |

インデックス: `(event_date)`（定期処理で削除対象を探す）

### join_tokens

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | TEXT | PK | |
| `tenant_id` | TEXT | NOT NULL, FK → tenants | |
| `token` | TEXT | NOT NULL, UNIQUE | 32 バイトの乱数（base64url）。管理面で参加 URL と QR コードを再表示するため、平文で保存する |
| `created_at` | INTEGER | NOT NULL | |
| `revoked_at` | INTEGER | NULL | 再発行で無効にした日時 |

インデックス: `UNIQUE (tenant_id) WHERE revoked_at IS NULL`（有効なトークンはテナントに 1 つ）

### couple_accesses

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | TEXT | PK | |
| `tenant_id` | TEXT | NOT NULL, FK → tenants | |
| `token` | TEXT | NOT NULL, UNIQUE | 32 バイトの乱数（base64url）。新郎新婦用 URL を再表示するため、平文で保存する |
| `passcode_hash` | TEXT | NOT NULL | `pbkdf2-sha256$<反復回数>$<ソルト>$<ハッシュ>` の形式。反復回数は Workers の Web Crypto で使える上限（実装時に確認） |
| `failed_attempts` | INTEGER | NOT NULL DEFAULT 0 | パスコードの連続失敗回数 |
| `locked_until` | INTEGER | NULL | この時刻まで入力を受け付けない |
| `terms_agreed_at` | INTEGER | NULL | 新郎新婦が規約に同意した日時 |
| `created_at` | INTEGER | NOT NULL | |
| `revoked_at` | INTEGER | NULL | 再発行で無効にした日時 |

インデックス: `UNIQUE (tenant_id) WHERE revoked_at IS NULL`

### seating_charts

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| `tenant_id` | TEXT | PK, FK → tenants | |
| `r2_key` | TEXT | NOT NULL | |
| `size_bytes` | INTEGER | NOT NULL | |
| `uploaded_at` | INTEGER | NOT NULL | |

### course_menu_images

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | TEXT | PK | |
| `tenant_id` | TEXT | NOT NULL, FK → tenants | |
| `r2_key` | TEXT | NOT NULL | |
| `content_type` | TEXT | NOT NULL | `image/jpeg` / `image/png` |
| `size_bytes` | INTEGER | NOT NULL | |
| `sort_order` | INTEGER | NOT NULL | 表示順（0 から） |
| `uploaded_at` | INTEGER | NOT NULL | |

インデックス: `(tenant_id, sort_order)`

### guests

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | TEXT | PK | |
| `tenant_id` | TEXT | NOT NULL, FK → tenants | |
| `nickname` | TEXT | NULL | 表示用のニックネーム。登録前は NULL |
| `nickname_key` | TEXT | NULL | 重複の判定用。前後の空白を除いた値（仮置き） |
| `terms_agreed_at` | INTEGER | NULL | 規約に同意した日時 |
| `created_at` | INTEGER | NOT NULL | |
| `last_seen_at` | INTEGER | NOT NULL | 書き込みを減らすため、更新は 10 分に 1 回まで（仮置き） |

インデックス: `UNIQUE (tenant_id, nickname_key)`（NULL どうしは重複にならない）

### photos

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | TEXT | PK | |
| `tenant_id` | TEXT | NOT NULL, FK → tenants | |
| `guest_id` | TEXT | NOT NULL, FK → guests（ON DELETE CASCADE） | 投稿者 |
| `original_key` | TEXT | NOT NULL | オリジナル（位置情報を除去済み） |
| `display_key` | TEXT | NOT NULL | 拡大表示用 |
| `thumb_key` | TEXT | NOT NULL | 一覧用 |
| `original_content_type` | TEXT | NOT NULL | `image/jpeg` / `image/png` |
| `stored_size_bytes` | INTEGER | NOT NULL | 3 つの画像の合計サイズ（保存容量の集計用） |
| `width` | INTEGER | NOT NULL | 拡大表示用画像の幅（一覧のレイアウト用） |
| `height` | INTEGER | NOT NULL | 拡大表示用画像の高さ |
| `like_count` | INTEGER | NOT NULL DEFAULT 0 | いいね数（集計値） |
| `created_at` | INTEGER | NOT NULL | |

インデックス:

- `(tenant_id, created_at DESC, id DESC)`: タイムライン
- `(tenant_id, like_count DESC, created_at ASC)`: ランキング
- `(guest_id, created_at DESC)`: 自分の投稿、投稿枚数

### likes

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| `photo_id` | TEXT | PK（1）, FK → photos（ON DELETE CASCADE） | |
| `guest_id` | TEXT | PK（2）, FK → guests（ON DELETE CASCADE） | |
| `tenant_id` | TEXT | NOT NULL, FK → tenants | |
| `created_at` | INTEGER | NOT NULL | |

インデックス: `(guest_id, photo_id)`（自分がいいね済みかの判定）

### visitor_sessions

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| `id_hash` | TEXT | PK | セッション ID の SHA-256（16 進数） |
| `tenant_id` | TEXT | NOT NULL, FK → tenants | |
| `kind` | TEXT | NOT NULL, CHECK (`guest` / `couple`) | |
| `guest_id` | TEXT | NULL, FK → guests（ON DELETE CASCADE） | `kind = guest` のとき |
| `couple_access_id` | TEXT | NULL, FK → couple_accesses（ON DELETE CASCADE） | `kind = couple` のとき |
| `created_at` | INTEGER | NOT NULL | |
| `last_seen_at` | INTEGER | NOT NULL | 更新は 10 分に 1 回まで（仮置き） |

インデックス: `(couple_access_id)`（新郎新婦用 URL の再発行時にまとめて削除する）

- セッションは期限を持たない。テナントの期間と停止状態（[tenant-periods.md](tenant-periods.md)）、新郎新婦の場合は `couple_accesses.revoked_at` で有効かどうかを判定する
- Cookie は Max-Age 400 日（Chrome の上限）で発行する（仮置き）。Cookie の名前は [api.md](api.md#cookie) を参照

### audit_logs

| 列 | 型 | 制約 | 説明 |
|---|---|---|---|
| `id` | TEXT | PK | |
| `tenant_id` | TEXT | NULL | 対象のテナント（外部キーにはしない） |
| `actor` | TEXT | NOT NULL | 管理者のメールアドレス。定期処理は `system` |
| `action` | TEXT | NOT NULL | 下の一覧 |
| `target_id` | TEXT | NULL | 写真 ID、参加者 ID など |
| `detail` | TEXT | NULL | JSON（変更前後の値など） |
| `created_at` | INTEGER | NOT NULL | |

インデックス: `(tenant_id, created_at)`

`action` の一覧: `tenant.create`、`tenant.update`、`tenant.suspend`、`tenant.resume`、`tenant.delete`、`seating_chart.upload`、`course_menu.add`、`course_menu.remove`、`course_menu.reorder`、`join_url.issue`、`couple_access.issue`、`photo.delete`、`guest.rename`

### Better Auth の表

- Better Auth の CLI で Drizzle 用のスキーマを生成し、表名に `auth_` を付ける（`auth_user`、`auth_session`、`auth_account`、`auth_verification`）
- 管理者だけが使う。参加者・新郎新婦は使わない

## 主なクエリ

| 用途 | 方法 |
|---|---|
| タイムライン | `WHERE tenant_id = ? AND (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT 30`。カーソルは最後の写真の `created_at` と `id` |
| 自分の投稿 | 上の条件に `AND guest_id = ?` を加える |
| ランキング | `WHERE tenant_id = ? AND like_count > 0 ORDER BY like_count DESC, created_at ASC LIMIT 10` |
| いいね | バッチ（トランザクション）で `INSERT INTO likes ... ON CONFLICT DO NOTHING` と、`UPDATE photos SET like_count = (SELECT COUNT(*) FROM likes WHERE photo_id = ?) WHERE id = ? AND tenant_id = ?` を実行する |
| いいねの取り消し | バッチで `DELETE FROM likes WHERE photo_id = ? AND guest_id = ?` と、上と同じ数え直しを実行する |
| 投稿枚数の上限 | `INSERT INTO photos (...) SELECT ... WHERE (SELECT COUNT(*) FROM photos WHERE guest_id = ?) < 100` で、上限内のときだけ登録する。登録されなかった場合は上限超過 |
| 保存容量 | `photos.stored_size_bytes`、`seating_charts.size_bytes`、`course_menu_images.size_bytes` の合計 |

## R2 のキー設計

| 対象 | キー |
|---|---|
| 写真（オリジナル） | `tenants/{tenantId}/photos/{photoId}/original.{jpg\|png}` |
| 写真（拡大表示用） | `tenants/{tenantId}/photos/{photoId}/display.jpg` |
| 写真（一覧用） | `tenants/{tenantId}/photos/{photoId}/thumb.jpg` |
| 席次表 | `tenants/{tenantId}/seating-chart/{uploadId}.pdf` |
| コース表の画像 | `tenants/{tenantId}/course-menu/{imageId}.{jpg\|png}` |

- オブジェクトには Content-Type を設定する
- 席次表は差し替えのたびに新しいキーで保存し、古いファイルを削除する

## データの削除

### テナントの削除（自動削除・手動削除）

1. R2 の `tenants/{tenantId}/` 以下を一覧し、1,000 件ずつ削除する
2. D1 のバッチで、`likes`、`photos`、`visitor_sessions`、`guests`、`join_tokens`、`couple_accesses`、`seating_charts`、`course_menu_images` からそのテナントの行を削除し、`tenants.data_deleted_at` を記録する
3. `audit_logs` に `tenant.delete` を記録する

途中で失敗した場合は `data_deleted_at` が空のまま残るので、次の定期処理でやり直す。

### 写真の削除

1. D1 から `photos` の行を削除する（いいねは外部キーでまとめて消える）。この時点で画面から見えなくなる
2. R2 から 3 つの画像を削除する。失敗した場合はログに残す（ファイルは非公開なので見えない。テナントの削除時に一緒に消える）
