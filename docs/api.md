# CLIBLOG API v1.0

## 概要

シンプルな REST API でブログを管理できます。
AI ツール（Claude Code、ChatGPT 等）や curl から直接操作可能。

**Base URL:** `https://api.cliblog.com`

**公開記事 URL:** `https://{subdomain}.cliblog.com/{slug}`

---

## 認証

すべての `/v1/*` API リクエストには API キーが必要です。

```
Authorization: Bearer sk_blog_{keyId}_{secret}
```

**API キーの形式:**
- `sk_blog_` - プレフィックス（固定）
- `{keyId}` - 12文字の識別子（UUIDv7 先頭部分）
- `{secret}` - 32文字のシークレット

**API キーの取得:**
1. 管理者に連絡してユーザーを作成（`POST /internal/users`）
2. 初期 API キーを発行してもらう（`POST /internal/users/:id/keys`）
3. 以降は `/v1/auth/keys` で自分で追加キーを発行可能

> ⚠️ API キーは発行時のみ表示されます。紛失した場合は新規発行が必要です。

---

## 権限（Permissions）

API キーには以下の権限を付与できます:

| 権限 | 説明 |
|------|------|
| `posts:read` | 記事の閲覧 |
| `posts:write` | 記事の作成・更新・削除 |
| `posts:publish` | 記事の公開 |
| `assets:read` | アセットの閲覧 |
| `assets:write` | アセットのアップロード・削除 |
| `keys:manage` | API キーの発行・一覧・削除 |

### 権限の制約

- **自分が持っていない権限は付与できません**（権限エスカレーション防止）
- 例: `posts:read,posts:write` しか持たないキーで `keys:manage` を含むキーは作成できません

### デフォルト権限

- 登録時の初期キー: 全権限（`posts:read,posts:write,posts:publish,assets:read,assets:write,keys:manage`）
- `/v1/auth/keys` で作成時のデフォルト: `keys:manage` を除く全権限

---

## エンドポイント一覧

### 認証

| Method | Endpoint | 説明 | 権限 |
|--------|----------|------|------|
| POST | `/v1/auth/register` | 新規登録 | 不要 |
| POST | `/v1/auth/keys` | API キー発行 | `keys:manage` |
| GET | `/v1/auth/keys` | キー一覧（秘密は含まない） | `keys:manage` |
| DELETE | `/v1/auth/keys/:id` | キー削除 | `keys:manage` |

### 記事

| Method | Endpoint | 説明 | 権限 |
|--------|----------|------|------|
| POST | `/v1/posts` | 記事作成 | `posts:write` |
| GET | `/v1/posts` | 記事一覧 | `posts:read` |
| GET | `/v1/posts/:id` | 記事取得（Markdown） | `posts:read` |
| PUT | `/v1/posts/:id` | 記事更新 | `posts:write` |
| DELETE | `/v1/posts/:id` | 記事削除 | `posts:write` |
| POST | `/v1/posts/:id/publish` | 記事公開 | `posts:publish` |

### アセット

| Method | Endpoint | 説明 | 権限 |
|--------|----------|------|------|
| POST | `/v1/assets` | 画像アップロード | `assets:write` |
| GET | `/v1/assets` | 画像一覧 | `assets:read` |
| GET | `/v1/assets/:id` | 画像情報 | `assets:read` |
| DELETE | `/v1/assets/:id` | 画像削除 | `assets:write` |

### 公開ページ（認証不要）

| Method | URL | 説明 |
|--------|-----|------|
| GET | `https://{subdomain}.cliblog.com/` | ブログインデックス |
| GET | `https://{subdomain}.cliblog.com/{slug}` | 記事ページ |

---

## 認証 API

### 新規登録（セルフサービス）

```bash
curl -X POST https://api.cliblog.com/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "subdomain": "mysite"
  }'
```

**リクエスト:**
| Field | Type | Required | 説明 |
|-------|------|----------|------|
| email | string |  | メールアドレス（任意、ログインには使用しない） |
| subdomain | string | ✓ | サブドメイン（3-30文字、英小文字・数字・ハイフン） |

> ✅ `email` は任意です。未指定の場合は `null` として保存されます。
> 未指定にする場合は、リクエストから `email` フィールドを省略してください。

**レスポンス (201):**
```json
{
  "data": {
    "id": "019c1ba8-...",
    "type": "user",
    "attributes": {
      "email": "user@example.com",
      "subdomain": "mysite",
      "blogUrl": "https://mysite.cliblog.com",
      "apiKey": "sk_blog_019c1ba8495f_a1b2c3d4...",
      "createdAt": "2026-02-02T00:00:00.000Z"
    }
  }
}
```

> ⚠️ `apiKey` フィールドは登録時のみ返されます。必ず保存してください。

### API キー発行

> ⚠️ `keys:manage` 権限が必要です。

```bash
curl -X POST https://api.cliblog.com/v1/auth/keys \
  -H "Authorization: Bearer sk_blog_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My New Key",
    "permissions": "posts:read,posts:write,posts:publish,assets:read,assets:write"
  }'
```

**リクエスト:**
| Field | Type | Required | 説明 |
|-------|------|----------|------|
| name | string | | キー名（デフォルト: "Unnamed Key"） |
| permissions | string | | 権限（カンマ区切り）。省略時は `keys:manage` 以外の全権限 |

**注意:** 自分が持っていない権限は付与できません（403 `auth.privilege_escalation`）

**レスポンス (201):**
```json
{
  "data": {
    "id": "019c1ba8-...",
    "type": "api_key",
    "attributes": {
      "name": "My New Key",
      "keyId": "019c1ba8495f",
      "key": "sk_blog_019c1ba8495f_a1b2c3d4...",
      "permissions": "posts:read,posts:write,posts:publish,assets:read,assets:write",
      "createdAt": "2026-02-02T00:00:00.000Z"
    }
  }
}
```

> ⚠️ `key` フィールドは発行時のみ返されます。必ず保存してください。

### API キー一覧

```bash
curl https://api.cliblog.com/v1/auth/keys \
  -H "Authorization: Bearer sk_blog_xxx"
```

### API キー削除

```bash
curl -X DELETE https://api.cliblog.com/v1/auth/keys/{id} \
  -H "Authorization: Bearer sk_blog_xxx"
```

---

## 記事 API

### 記事作成

```bash
curl -X POST https://api.cliblog.com/v1/posts \
  -H "Authorization: Bearer sk_blog_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Hello World",
    "content": "# Hello\n\nThis is my first post!",
    "slug": "hello-world"
  }'
```

**リクエスト:**
| Field | Type | Required | 説明 |
|-------|------|----------|------|
| title | string | ✓ | 記事タイトル |
| content | string | ✓ | Markdown 本文 |
| slug | string | | URL スラッグ（省略時は title から自動生成） |

**レスポンス (201):**
```json
{
  "data": {
    "id": "019c1ba8-495f-76a9-...",
    "type": "post",
    "attributes": {
      "title": "Hello World",
      "slug": "hello-world",
      "excerpt": "This is my first post!",
      "status": "draft",
      "createdAt": "2026-02-02T00:00:00.000Z",
      "updatedAt": "2026-02-02T00:00:00.000Z"
    }
  }
}
```

### 記事一覧

```bash
curl https://api.cliblog.com/v1/posts?status=published&limit=20&offset=0 \
  -H "Authorization: Bearer sk_blog_xxx"
```

**クエリパラメータ:**
| Param | Type | Default | 説明 |
|-------|------|---------|------|
| status | string | | `draft` または `published` |
| limit | number | 20 | 最大 100 |
| offset | number | 0 | ページネーション用 |

### 記事取得

```bash
curl https://api.cliblog.com/v1/posts/{id} \
  -H "Authorization: Bearer sk_blog_xxx"
```

レスポンスには生の Markdown (`content`) が含まれます。

### 記事公開

```bash
curl -X POST https://api.cliblog.com/v1/posts/{id}/publish \
  -H "Authorization: Bearer sk_blog_xxx"
```

公開後、`https://{subdomain}.cliblog.com/{slug}` でアクセス可能になります。

---

## アセット API

### 画像アップロード

```bash
curl -X POST https://api.cliblog.com/v1/assets \
  -H "Authorization: Bearer sk_blog_xxx" \
  -F "file=@image.png" \
  -F "type=image"
```

**フォームデータ:**
| Field | Type | Required | 説明 |
|-------|------|----------|------|
| file | File | ✓ | 画像ファイル |
| type | string | ✓ | `image`（v1.0 では画像のみ） |
| postId | string | | 関連付ける記事 ID |

**対応形式:** PNG, JPEG, GIF, WebP（最大 10MB）

**レスポンス (201):**
```json
{
  "data": {
    "id": "019c1ba9-4f59-...",
    "type": "asset",
    "attributes": {
      "assetType": "image",
      "filename": "image.png",
      "mimeType": "image/png",
      "sizeBytes": 12345,
      "url": "https://img.cliblog.com/019c1ba9-4f59-....png",
      "markdownRef": "![](asset:019c1ba9-4f59-...)",
      "createdAt": "2026-02-02T00:00:00.000Z"
    }
  }
}
```

### Markdown での使用

レスポンスの `markdownRef` をそのまま記事に挿入:

```markdown
# My Post

Here is an image:

![](asset:019c1ba9-4f59-...)
```

---

## エラーレスポンス

すべてのエラーは統一フォーマットで返されます:

```json
{
  "errors": [{
    "code": "posts.not_found",
    "status": 404,
    "title": "Not Found",
    "detail": "Post xxx not found"
  }]
}
```

### エラーコード一覧

| Code | Status | 説明 |
|------|--------|------|
| `auth.missing_key` | 401 | Authorization ヘッダーがない |
| `auth.invalid_format` | 401 | API キーの形式が不正 |
| `auth.invalid_key` | 401 | API キーが無効 |
| `auth.insufficient_permissions` | 403 | 必要な権限がない |
| `auth.privilege_escalation` | 403 | 自分が持っていない権限を付与しようとした |
| `auth.invalid_permissions` | 400 | 無効な権限文字列 |
| `auth.key_not_found` | 404 | 指定された API キーが存在しない |
| `auth.forbidden` | 403 | 他ユーザーのリソースへのアクセス |
| `auth.invalid_email` | 400 | メールアドレスが不正（指定した場合のみ） |
| `auth.invalid_subdomain` | 400 | サブドメインが不正 |
| `auth.subdomain_reserved` | 400 | サブドメインが予約済み |
| `auth.subdomain_taken` | 409 | サブドメインが既に使用されている |
| `auth.email_taken` | 409 | メールアドレスが既に登録されている（指定した場合のみ） |
| `posts.not_found` | 404 | 記事が見つからない |
| `posts.invalid_input` | 400 | 必須フィールドが不足 |
| `posts.slug_conflict` | 409 | スラッグが既に存在する |
| `assets.not_found` | 404 | アセットが見つからない |
| `assets.missing_file` | 400 | ファイルがアップロードされていない |
| `assets.invalid_type` | 400 | 無効なアセットタイプ（v1.0 は image のみ） |
| `assets.invalid_file_type` | 400 | 対応していないファイル形式 |
| `assets.file_too_large` | 400 | ファイルサイズ超過（10MB 上限） |
| `internal.server_error` | 500 | 内部エラー |

---

## レート制限（将来実装予定）

> ⚠️ v1.0 ではレート制限は未実装です。将来バージョンで追加予定。

**予定仕様:**

| スコープ | 制限 | ウィンドウ |
|---------|------|-----------|
| 未認証 | 20 req | 1分 |
| 認証済み | 50 req | 1分 |

---

## 公開ページ

### ブログインデックス

```
GET https://{subdomain}.cliblog.com/
```

公開済み記事の一覧を HTML で返します。

### 記事ページ

```
GET https://{subdomain}.cliblog.com/{slug}
```

Markdown から変換された HTML を返します。

**セキュリティヘッダー:**

すべての公開ページに以下のヘッダーが付与されます:

```
Content-Security-Policy: default-src 'self'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

**キャッシュ:**

```
Cache-Control: public, s-maxage=60, stale-while-revalidate=30
```

---

## Markdown 記法

### 基本

- 見出し: `# H1`, `## H2`, `### H3`
- 強調: `**太字**`, `*斜体*`
- リンク: `[テキスト](URL)`
- 画像: `![alt](URL)`
- コード: `` `inline` ``, ```` ```block``` ````
- 引用: `> quote`
- リスト: `- item`, `1. item`
- テーブル: GFM 形式

### アセット参照

アップロードした画像は `asset:ID` 形式で参照:

```markdown
![キャプション](asset:019c1ba9-4f59-...)
```

レンダリング時に `https://img.cliblog.com/{id}.png` に変換されます。
