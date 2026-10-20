# API 仕様

guest Worker（`https://would-you-marry.me`）と admin Worker（`https://admin.would-you-marry.me`）の API を定義する。
認証の考え方は [auth.md](../design/auth.md)、表の構造は [database.md](database.md) を参照。

## 共通の約束

### 形式

- リクエストとレスポンスは JSON（ファイルの送受信を除く）
- 日時は ISO 8601（例: `2026-10-31T12:34:56.789Z`）、開催日は `YYYY-MM-DD`
- 一覧はカーソル方式で取得する。`?cursor=<前回の nextCursor>&limit=<件数>`。`limit` は既定 30、最大 50
- 状態を変えるリクエスト（GET 以外）では、`Origin` ヘッダーが自分のドメインと一致することを確認する（CSRF 対策）

### エラー

```json
{ "error": { "code": "NICKNAME_TAKEN", "message": "nickname already in use" } }
```

- 画面に出す文言は、`code` をもとに [messages.md](messages.md) の文言を表示する。`message` は開発用の英語
- 項目ごとの入力エラーは `error.fields` に `{ "nickname": "TOO_LONG" }` の形で返す

| code | HTTP | 意味 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | セッションがない、または無効 |
| `FORBIDDEN` | 403 | 権限がない（他のテナント、他人の写真など） |
| `NOT_FOUND` | 404 | 対象がない |
| `TENANT_NOT_FOUND` | 404 | テナントがない、またはデータ削除済み |
| `TENANT_SUSPENDED` | 403 | テナントが停止中 |
| `OUTSIDE_JOINING_PERIOD` | 403 | 参加受付期間外のため参加できない |
| `PERIOD_ENDED` | 403 | 利用できる期間が終わっている |
| `JOIN_TOKEN_INVALID` | 403 | 参加トークンが無効（再発行済みなど） |
| `NICKNAME_REQUIRED` | 403 | ニックネームが未登録 |
| `NICKNAME_TAKEN` | 409 | 同じテナントで使用中のニックネーム |
| `TERMS_NOT_AGREED` | 400 | 規約への同意が必要 |
| `VALIDATION_ERROR` | 400 | 入力が不正（`fields` に詳細） |
| `FILE_TOO_LARGE` | 413 | ファイルサイズの上限超過 |
| `UNSUPPORTED_FILE_TYPE` | 415 | 受け付けない形式 |
| `UPLOAD_LIMIT_REACHED` | 409 | 投稿枚数の上限（100 枚）に達している |
| `COUPLE_LINK_INVALID` | 403 | 新郎新婦用 URL が無効、または入場の手続きの有効期限切れ |
| `PASSCODE_INVALID` | 401 | パスコードが違う（`remainingAttempts` を返す） |
| `PASSCODE_LOCKED` | 429 | 入力回数の上限に達した（`retryAfterSeconds` を返す） |
| `CONFIRMATION_MISMATCH` | 400 | 削除の確認で入力したテナント名が一致しない |
| `RATE_LIMITED` | 429 | リクエストが多すぎる |
| `INTERNAL_ERROR` | 500 | サーバーのエラー |

### Cookie

| 名前 | Worker | 内容 | 属性 |
|---|---|---|---|
| `wym_g_{tenantId}` | guest | 参加者のセッション ID | HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age 400 日 |
| `wym_c_{tenantId}` | guest | 新郎新婦のセッション ID | 同上 |
| `wym_couple_pending` | guest | 新郎新婦用 URL のトークン（パスコード入力まで一時的に保持） | HttpOnly, Secure, SameSite=Lax, Path=/api/couple, Max-Age 15 分 |
| Better Auth の Cookie | admin | 管理者のセッション | Better Auth の既定 |

- テナントごとに Cookie を分けるので、同じブラウザで複数の結婚式に参加したり、新郎新婦が参加者としても参加したりできる
- Cookie にドメイン属性は付けない

### 共通の型

```ts
type TenantPhase = 'preparation' | 'joining' | 'viewing' | 'couple_only' | 'expired'

type TenantSummary = {
  id: string
  name: string
  eventDate: string // YYYY-MM-DD
  phase: TenantPhase
}

type Photo = {
  id: string
  uploader: { id: string; nickname: string } // id は新郎新婦・管理者向けのみ
  likeCount: number
  likedByMe?: boolean // 参加者向けのみ
  isMine?: boolean // 参加者向けのみ
  width: number // 拡大表示用画像の幅
  height: number
  createdAt: string
  urls: { thumb: string; display: string; original: string }
}

type RankedPhoto = Photo & { rank: number } // 1 から順に振る（同数でも連番）
```

---

## guest Worker

### ページ遷移（サーバー側の処理）

#### `GET /join/:tenantId?t={token}`（参加、FR-G-01 / FR-G-02）

1. テナントがない、またはデータ削除済み → `/error?code=TENANT_NOT_FOUND` へリダイレクト
2. このテナントの有効な参加者セッションがある → ニックネーム登録済みなら `/t/:tenantId`、未登録なら `/t/:tenantId/nickname` へ
3. 停止中 → `/error?code=TENANT_SUSPENDED`
4. 参加受付期間外 → `/error?code=OUTSIDE_JOINING_PERIOD`
5. トークンが有効なものと一致しない → `/error?code=JOIN_TOKEN_INVALID`
6. 参加者とセッションを作り、`wym_g_{tenantId}` を設定して `/t/:tenantId/nickname` へ

同じ IP アドレスからの参加は 1 分に 200 回まで（D-38）。超えた場合は `/error?code=RATE_LIMITED`。

#### `GET /couple/:tenantId?t={token}`（新郎新婦用 URL、FR-C-01）

1. このテナントの有効な新郎新婦セッションがある → `/couple/:tenantId/photos` へ
2. テナントがない・削除済み・停止中・期間外、またはトークンが無効 → `/error?code=...`
3. `wym_couple_pending` にトークンを入れ、`/couple/:tenantId/login` へリダイレクト（URL からトークンを取り除く）

#### 画面のルート（SPA）

| パス | 画面 |
|---|---|
| `/t/:tenantId/nickname` | SG-02 ニックネーム登録・変更 |
| `/t/:tenantId` | SG-03 ホーム |
| `/t/:tenantId/seating` | SG-04 席次表 |
| `/t/:tenantId/menu` | SG-05 料理のコース表 |
| `/t/:tenantId/album` | SG-06 共有フォトアルバム（`?tab=ranking`、`?mine=1`） |
| `/t/:tenantId/upload` | SG-07 フォトアップロード |
| `/couple/:tenantId/login` | SC-01 パスコード入力 |
| `/couple/:tenantId/photos` | SC-02 写真一覧 |
| `/error` | SG-E1 / SC-E1 エラー（`?code=`） |
| `/terms`、`/privacy` | 利用規約、プライバシーポリシー |

### 参加者向け API

パスはすべて `/api/t/:tenantId` で始まる。共通の確認:

- `wym_g_{tenantId}` のセッションが有効（なければ `UNAUTHENTICATED`）
- テナントが停止中でない（`TENANT_SUSPENDED`）、参加受付期間か閲覧期間（`PERIOD_ENDED`）
- `me` 系以外はニックネーム登録済み（`NICKNAME_REQUIRED`）

| メソッド | パス | 内容 | 関連 |
|---|---|---|---|
| GET | `/me` | 自分と結婚式の情報 | FR-G-03, FR-G-04 |
| PUT | `/me/nickname` | ニックネームの登録・変更 | FR-G-03, FR-G-14 |
| GET | `/seating-chart` | 席次表 PDF | FR-G-05 |
| GET | `/course-menu` | コース表の画像の一覧 | FR-G-06 |
| GET | `/course-menu/images/:imageId` | コース表の画像 | FR-G-06 |
| GET | `/photos` | タイムライン（`?mine=1` で自分の投稿のみ） | FR-G-09 |
| GET | `/photos/ranking` | ランキング（上位 10 枚） | FR-G-12 |
| POST | `/photos` | 写真のアップロード | FR-G-07 |
| DELETE | `/photos/:photoId` | 自分の写真の削除 | FR-G-13 |
| PUT | `/photos/:photoId/like` | いいね | FR-G-10 |
| DELETE | `/photos/:photoId/like` | いいねの取り消し | FR-G-10 |
| GET | `/photos/:photoId/thumb` | 一覧用画像 | FR-G-09 |
| GET | `/photos/:photoId/display` | 拡大表示用画像 | FR-G-08 |
| GET | `/photos/:photoId/original` | オリジナル画像（`?download=1` でダウンロード） | FR-G-11 |

#### `GET /me`

```json
{
  "tenant": { "id": "…", "name": "〇〇家・△△家 結婚式", "eventDate": "2026-10-31", "phase": "joining" },
  "me": { "id": "…", "nickname": "たろう", "termsAgreed": true, "photoCount": 12, "photoLimit": 100 }
}
```

`nickname` は未登録なら `null`。

#### `PUT /me/nickname`

```json
{ "nickname": "たろう", "agreeToTerms": true }
```

- `nickname`: 前後の空白を除いて 1〜20 文字
- `agreeToTerms`: 初回の登録では `true` が必須（`TERMS_NOT_AGREED`）。2 回目以降は不要
- エラー: `VALIDATION_ERROR`、`NICKNAME_TAKEN`、`TERMS_NOT_AGREED`
- 成功: `200`、`GET /me` と同じ形

#### `GET /photos`

```json
{ "photos": [ /* Photo */ ], "nextCursor": "1730342096789_…" }
```

- 新しい順。`nextCursor` が `null` なら最後まで取得済み
- `uploader.id` は返さない

#### `GET /photos/ranking`

```json
{ "photos": [ /* RankedPhoto（最大 10 件） */ ] }
```

#### `POST /photos`

`multipart/form-data`:

| 項目 | 内容 | 制限 |
|---|---|---|
| `original` | オリジナル画像 | JPEG / PNG、10MB まで |
| `display` | 拡大表示用画像（ブラウザで作る、長辺 1,600px） | JPEG、2MB まで |
| `thumb` | 一覧用画像（ブラウザで作る、長辺 480px） | JPEG、512KB まで |
| `width` / `height` | 拡大表示用画像の幅・高さ | 整数 |

処理:

1. 期間・停止・ニックネームを確認し、投稿枚数が 100 枚未満かを確認する（`UPLOAD_LIMIT_REACHED`）
2. ファイルの先頭のバイト列で形式を確認する（`UNSUPPORTED_FILE_TYPE`）。サイズを確認する（`FILE_TOO_LARGE`）
3. オリジナルからメタデータを取り除く（再圧縮しない）
   - JPEG: EXIF は向き（Orientation）だけを残す。XMP、IPTC などのメタデータは削除する。色を正しく表示するため ICC プロファイルは残す
   - PNG: `eXIf`、`tEXt`、`iTXt`、`zTXt` のチャンクを削除する
4. R2 に 3 つの画像を保存する
5. 上限を確かめながら D1 に登録する（[database.md](database.md#主なクエリ)）。上限で登録できなかった場合は、保存した画像を消して `UPLOAD_LIMIT_REACHED` を返す
6. `201` で `{ "photo": Photo }` を返す

HEIC は、早期検証（[architecture.md](../design/architecture.md#早めに検証すること)）の結果を見て扱いを決める。それまでは `UNSUPPORTED_FILE_TYPE` とする。

#### `DELETE /photos/:photoId`

- 自分の写真でなければ `FORBIDDEN`
- 成功: `204`

#### `PUT /photos/:photoId/like`、`DELETE /photos/:photoId/like`

- 何度実行しても結果は同じ（すでにいいね済みなら何もしない）
- 成功: `200`、`{ "likeCount": 5, "likedByMe": true }`

#### 画像の取得

- R2 から返す。`Cache-Control: private, max-age=31536000, immutable`（画像の中身は変わらないため）
- `original?download=1` は `Content-Disposition: attachment; filename="wedding-photo-{photoId}.jpg"` を付ける
- 席次表 PDF は差し替えがあるので `Cache-Control: private, no-cache` と ETag を付ける

### 新郎新婦向け API

パスはすべて `/api/couple/:tenantId` で始まる。`login` 以外の共通の確認:

- `wym_c_{tenantId}` のセッションが有効で、新郎新婦用 URL が再発行で無効になっていない（`UNAUTHENTICATED`）
- テナントが停止中でない（`TENANT_SUSPENDED`）、削除済みでない（`PERIOD_ENDED`）

| メソッド | パス | 内容 | 関連 |
|---|---|---|---|
| GET | `/login` | 入場の準備状態（`wym_couple_pending` が必要） | FR-C-01 |
| POST | `/login` | パスコードを入力して入場 | FR-C-01, FR-C-06 |
| GET | `/me` | 結婚式の情報 | FR-C-02 |
| GET | `/photos` | 写真一覧（`?uploaderId=` で投稿者を絞り込む） | FR-C-02, FR-C-04 |
| GET | `/photos/ranking` | ランキング | FR-C-03 |
| GET | `/uploaders` | 投稿者の一覧 | FR-C-04 |
| GET | `/photos/:photoId/thumb` ほか | 画像（参加者向けと同じ 3 種類） | FR-C-05 |

#### `GET /login`

```json
{ "tenantName": "〇〇家・△△家 結婚式", "needsTermsAgreement": true }
```

`wym_couple_pending` がない、または期限切れなら `COUPLE_LINK_INVALID`。

#### `POST /login`

```json
{ "passcode": "AB12CD34", "agreeToTerms": true }
```

- ロック中なら `PASSCODE_LOCKED`（`retryAfterSeconds`）
- パスコードが違えば失敗回数を増やして `PASSCODE_INVALID`（`remainingAttempts`）。5 回目でロックする
- 初回で `agreeToTerms` が `true` でなければ `TERMS_NOT_AGREED`
- 成功: 失敗回数を 0 に戻し、`wym_c_{tenantId}` を設定して `wym_couple_pending` を消す。`200`

#### `GET /uploaders`

```json
{ "uploaders": [ { "id": "…", "nickname": "たろう", "photoCount": 12 } ] }
```

ニックネームの順に並べる。写真を 1 枚も投稿していない参加者は含めない。

### 共通

| メソッド | パス | 内容 | 認証 |
|---|---|---|---|
| GET | `/api/config` | `{ "contactEmail": "…" }`（問い合わせ先、FR-G-15） | 不要 |

---

## admin Worker

`/api/auth/*` は Better Auth に任せる。それ以外の `/api/*` はすべて、Better Auth のセッションがあり、メールアドレスが許可リスト（`ADMIN_EMAILS`）にあることを確認する（`UNAUTHENTICATED` / `FORBIDDEN`）。
変更を伴う操作は `audit_logs` に記録する。

| メソッド | パス | 内容 | 関連 |
|---|---|---|---|
| * | `/api/auth/*` | Better Auth（Google ログイン、ログアウト） | FR-A-01 |
| GET | `/api/me` | ログイン中の管理者 | FR-A-01 |
| GET | `/api/tenants` | テナント一覧と利用状況 | FR-A-02, FR-A-10 |
| POST | `/api/tenants` | テナントの作成 | FR-A-03 |
| GET | `/api/tenants/:tenantId` | テナントの詳細・利用状況・期間 | FR-A-04, FR-A-10, FR-A-13 |
| PATCH | `/api/tenants/:tenantId` | 基本情報の変更、停止・再開 | FR-A-04 |
| POST | `/api/tenants/:tenantId/deletion` | テナントの手動削除 | FR-A-15 |
| GET | `/api/tenants/:tenantId/seating-chart` | 席次表 PDF | FR-A-05, FR-A-14 |
| PUT | `/api/tenants/:tenantId/seating-chart` | 席次表 PDF の登録・差し替え | FR-A-05 |
| GET | `/api/tenants/:tenantId/course-menu` | コース表の画像の一覧 | FR-A-06, FR-A-14 |
| POST | `/api/tenants/:tenantId/course-menu/images` | コース表の画像の追加 | FR-A-06 |
| GET | `/api/tenants/:tenantId/course-menu/images/:imageId` | コース表の画像 | FR-A-06 |
| DELETE | `/api/tenants/:tenantId/course-menu/images/:imageId` | コース表の画像の削除 | FR-A-06 |
| PUT | `/api/tenants/:tenantId/course-menu/order` | コース表の画像の並べ替え | FR-A-06 |
| GET | `/api/tenants/:tenantId/join-url` | 参加 URL | FR-A-07 |
| POST | `/api/tenants/:tenantId/join-url` | 参加 URL の発行・再発行 | FR-A-07, FR-A-08 |
| GET | `/api/tenants/:tenantId/couple-access` | 新郎新婦用 URL | FR-A-12 |
| POST | `/api/tenants/:tenantId/couple-access` | 新郎新婦用 URL・パスコードの発行・再発行 | FR-A-12 |
| GET | `/api/tenants/:tenantId/photos` | 写真一覧 | FR-A-11 |
| DELETE | `/api/tenants/:tenantId/photos/:photoId` | 写真の削除 | FR-A-11 |
| GET | `/api/tenants/:tenantId/photos/:photoId/thumb` ほか | 画像（3 種類） | FR-A-11 |
| GET | `/api/tenants/:tenantId/guests` | 参加者一覧 | FR-A-16 |
| PATCH | `/api/tenants/:tenantId/guests/:guestId` | ニックネームの変更 | FR-A-16 |

### 主なリクエスト・レスポンス

#### `GET /api/tenants`

```json
{
  "tenants": [
    {
      "id": "…", "name": "〇〇家・△△家 結婚式", "eventDate": "2026-10-31", "phase": "preparation",
      "suspended": false, "createdAt": "…", "dataDeletedAt": null,
      "stats": { "guestCount": 0, "photoCount": 0, "likeCount": 0, "storageBytes": 0 }
    }
  ]
}
```

開催日の新しい順に並べる。

#### `POST /api/tenants`

```json
{ "name": "〇〇家・△△家 結婚式", "eventDate": "2026-10-31" }
```

`201`、`{ "tenant": … }`。

#### `GET /api/tenants/:tenantId`

一覧の項目に加えて、期間の境界を返す。

```json
{
  "tenant": { "…": "…" },
  "boundaries": {
    "joiningStart": "2026-10-30T15:00:00.000Z",
    "viewingStart": "2026-11-01T15:00:00.000Z",
    "coupleOnlyStart": "2027-01-31T15:00:00.000Z",
    "deletionAt": "2027-04-30T15:00:00.000Z"
  }
}
```

#### `PATCH /api/tenants/:tenantId`

```json
{ "name": "…", "eventDate": "2026-11-01", "suspended": true }
```

どの項目も省略できる。データ削除済みのテナントは変更できない（`TENANT_NOT_FOUND`）。

#### `POST /api/tenants/:tenantId/deletion`

```json
{ "confirmName": "〇〇家・△△家 結婚式" }
```

テナント名と一致しなければ `CONFIRMATION_MISMATCH`。成功すると [database.md](database.md#テナントの削除自動削除手動削除) の手順で削除し、`204` を返す。

#### `PUT /api/tenants/:tenantId/seating-chart`

本文は PDF そのもの（`Content-Type: application/pdf`、20MB まで）。`200`、`{ "sizeBytes": …, "uploadedAt": "…" }`。

#### `POST /api/tenants/:tenantId/course-menu/images`

`multipart/form-data` の `file`（JPEG / PNG、10MB まで）。末尾に追加し、`201` で `{ "image": { "id": "…", "url": "…" } }` を返す。

#### `PUT /api/tenants/:tenantId/course-menu/order`

```json
{ "imageIds": ["…", "…"] }
```

テナントのすべての画像 ID を、表示したい順に並べて送る。

#### `GET` / `POST /api/tenants/:tenantId/join-url`

```json
{ "url": "https://would-you-marry.me/join/{tenantId}?t={token}", "issuedAt": "…", "joiningStart": "…", "joiningEnd": "…" }
```

- 未発行なら GET は `{ "url": null }`
- POST は新しいトークンを発行し、古いトークンに `revoked_at` を記録する（参加者のセッションはそのまま）
- QR コードは管理画面（ブラウザ）で `url` から生成する

#### `GET` / `POST /api/tenants/:tenantId/couple-access`

- GET: `{ "url": "https://would-you-marry.me/couple/{tenantId}?t={token}", "issuedAt": "…", "termsAgreedAt": null }`（パスコードは返さない）
- POST: 新しいトークンとパスコードを発行し、古いものを無効にして、その新郎新婦のセッションを削除する。パスコードはこのレスポンスでだけ返す

```json
{ "url": "…", "passcode": "AB12CD34", "issuedAt": "…" }
```

#### `GET /api/tenants/:tenantId/guests`

```json
{ "guests": [ { "id": "…", "nickname": "たろう", "photoCount": 12, "createdAt": "…" } ] }
```

#### `PATCH /api/tenants/:tenantId/guests/:guestId`

```json
{ "nickname": "ゲスト 1" }
```

参加者自身の変更と同じルール（`VALIDATION_ERROR`、`NICKNAME_TAKEN`）。

### 参加者画面のプレビュー（FR-A-14）

専用の API は作らない。ゲスト用の画面部品（`packages/ui`）を管理画面でも使い、席次表・コース表は admin Worker の上の API から取得して表示する。

### 定期処理

admin Worker の `scheduled` ハンドラーで、毎日 3:00（UTC 18:00）に削除対象のテナントを削除する（[tenant-periods.md](tenant-periods.md#実装)）。
