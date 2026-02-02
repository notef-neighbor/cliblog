# AIネイティブ ヘッドレスブログサービス

> **AI時代における「自分の場所」を、すべての人に。**

プラットフォームに依存せず、セルフホストの面倒さもなく、
AIと自然に連携できる、自分だけのブログを。

> ※ **CLIBLOG は仮の名前です。** 正式名称は別途決定します。
> ドキュメント内の `cliblog.com` は仮のドメインです。

詳細なコンセプトは [CONCEPT.md](./CONCEPT.md) を参照。

---

## v1.0 実装状況

| 機能 | 状態 | 備考 |
|------|------|------|
| **認証 API** | ✅ 完了 | HMAC-SHA256 検証、keyId ルックアップ |
| **Posts API** | ✅ 完了 | CRUD + publish、Outbox パターン |
| **Assets API** | ✅ 完了 | 画像アップロード（type=image のみ） |
| **動的レンダリング** | ✅ 完了 | Markdown → HTML、CSP/セキュリティヘッダー |
| **サブドメインルーティング** | ✅ 完了 | `{user}.cliblog.com/{slug}` |
| **テスト** | ✅ 完了 | vitest 41 tests passing |
| Rate Limit | 🔲 未実装 | v1.0 スコープ外 |
| MCP Server | 🔲 未実装 | v2 以降 |

---

## このサービスは何か / 何でないか

### これは:
- **シンプルな REST API** を提供するヘッドレスブログサービス
- **外部のAIツール**（Claude Code、ChatGPT等）から API を叩いて投稿できる
- curl や任意の HTTP クライアントから操作できる

### これではない:
- **AIを内蔵したサービスではない** - AI機能は一切組み込まれていない
- **独自CLIを提供しない** - `blog post` のようなコマンドはない
- **Webエディタを提供しない** - ブラウザで記事を書くUIはない

### なぜ「AIネイティブ」と呼ぶのか

このサービス自体にAIは組み込まれていません。
「AIネイティブ」とは、**AIツールから使いやすいように設計されたAPI**という意味です。

```
┌─────────────────────────────────────────────────────────────┐
│  外部AIツール（このサービスの一部ではない）                   │
│                                                             │
│  Claude Code ──┐                                            │
│  ChatGPT ──────┼──→ REST API を叩く                         │
│  Cursor ───────┘                                            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  このサービス（AIは組み込まれていない）                       │
│                                                             │
│  シンプルな REST API                                         │
│  - POST /v1/posts  → 記事作成                                │
│  - GET /v1/posts   → 記事一覧                                │
│  - ...                                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 設計哲学：ジャック・ドーシーを宿す

> "Simplicity is a great virtue but it requires hard work to achieve it
> and education to appreciate it." — Edsger W. Dijkstra

このサービスはジャック・ドーシーの設計哲学を参考にしている。

### 1. 制約が自由を生む

Twitter の 140 文字制限が新しい表現を生んだように、
**API-only / Markdown-only** という制約が価値を生む。

- Web UI を作らない → API が洗練される
- フォーマットを増やさない → Markdown エコシステムと統合できる
- 機能を増やさない → 壊れにくい

### 2. ユーザーがデータを所有する

Bluesky / AT Protocol の思想と同じく、
**データのポータビリティ**を最優先する。

- いつでも全データを Markdown でエクスポート
- オープンソースでセルフホスト可能
- プラットフォームロックインなし

### 3. プロトコル > プロダクト

このサービスは「プロダクト」ではなく「プロトコル」として設計する。

- OpenAPI で仕様を公開
- 誰でも互換クライアントを作れる
- サービスが消えてもプロトコルは残る

### 4. 最小限で最大限

Square の決済端末が「小さな四角」から始まったように、
**最小のコアを磨き上げる**ことに集中する。

```
v1.0 で動くもの = コア
v2 以降で足すもの = オプション
```

コアが腐ったら終わり。オプションは後からいくらでも足せる。

---

## 自由の保証（v1.0 から必須）

これらは v1.0 から保証し、後から削らない:

| 保証 | 内容 |
|------|------|
| **OpenAPI** | API仕様を公開、どのクライアントからも使える |
| **Full Export** | 全データをMarkdownでエクスポート可能 |
| **Always Markdown** | 本文は常にMarkdown、フォーマット変換なし |

**ユーザーへのメッセージ:**
> 「あなたのデータは常にあなたのもの。
> 将来的にはカスタムドメインやセルフホストにも対応予定。
> このサービスに閉じ込められることはありません。」

---

## 概要

**外部のAIツールや curl から直接投稿できるブログサービス**

```
# Claude Code から（MCPで API を叩く）
ユーザー: 「今日の会話をブログにまとめて投稿して」
Claude:   [MCP経由で POST /v1/posts を実行]
          ✓ 公開しました

# curl から（直接 API を叩く）
$ curl -X POST https://api.cliblog.com/v1/posts \
    -H "Authorization: Bearer sk_blog_xxx" \
    -d '{"title": "Hello", "content": "..."}'
```

### 基本情報

| 項目 | 内容 |
|------|------|
| **ライセンス** | MIT |
| **公開形態** | オープンソース + マネージドサービス |
| **技術スタック** | Cloudflare Workers, D1, R2 |
| **ホスティング** | Cloudflare 固定（Paid プラン推奨） |

> ※ Durable Objects は v2 以降の SSG 導入時に使用予定

**2つの使い方:**
- **マネージドサービス**: サインアップ → 即 `you.cliblog.com` で公開
- **セルフホスト**: オープンソースを自分の Cloudflare アカウントにデプロイ

> **Note:** このプロジェクトは Cloudflare Workers + D1 + R2 の組み合わせで
> 最高のパフォーマンスを発揮するよう最適化されています。
> 将来的に PostgreSQL 互換 DB や他のランタイムへの対応を検討する可能性があります。
> マルチクラウド対応の PR は大歓迎です！

---

## なぜ必要か

既存のブログサービスはAI時代に最適化されていない。

| サービス | 問題 |
|---------|------|
| WordPress | 重い。管理が面倒。APIは後付け。 |
| note/Medium | プラットフォーム依存。Markdown非対応 or 弱い。 |
| Zenn/dev.to | 開発者向けだがプラットフォーム内に閉じる。 |
| Hugo/Jekyll | 自由だがCI/CD設定が面倒。毎回pushが必要。 |

**共通の問題: AIから直接投稿できない。**

---

## 解決策

| 課題 | このサービス |
|------|-------------|
| セットアップが面倒 | サインアップ → 即公開 |
| AIと連携できない | シンプルな REST API で直接投稿（v2 で MCP/GPTs 対応予定） |
| プラットフォーム依存 | 自分のドメイン、データ所有 |
| セルフホストが大変 | マネージドサービス提供 |

---

## ターゲットユーザー

### Primary: AIを日常的に使う開発者
- Claude Code / Cursor / ChatGPT を仕事で使っている
- 学んだこと、作ったものを記録・発信したい
- 自分のドメインで「自分のサイト」を持ちたい

### Secondary: 記録を残したいナレッジワーカー（将来）
- 現時点では対象外（Web UIがないため）
- 将来、シンプルなUIを追加したら対象に

---

## コアユースケース

### AIから直接投稿

```
ユーザー: 今日の会話の内容をブログ記事にまとめて投稿して

Claude: 了解しました。記事を作成して公開します。

[MCP: create_and_publish_post]
- title: "Claude Codeでブログサービスを設計した話"
- content: (会話内容をまとめたMarkdown)

✓ 公開しました: https://you.cliblog.com/designing-blog-with-claude
```

### curlで直接投稿

```bash
curl -X POST https://api.cliblog.com/v1/posts \
  -H "Authorization: Bearer sk_blog_xxx" \
  -d '{
    "title": "手動投稿テスト",
    "content": "# Hello\n\nこれはcurlからの投稿です。"
  }'
```

---

## v1.0 最小仕様

> **v0 = v1.0**（同義）
> 「v0」は開発中の呼び名、「v1.0」は公開時のバージョン番号。
>
> **Phase 1 だけでローンチして、ユーザーの声を聞け。計画は最小限に。**

### v1.0 API（確定版）

| カテゴリ | Endpoint | 説明 |
|----------|----------|------|
| **認証** | `POST /v1/auth/keys` | APIキー発行（秘密は発行時のみ表示） |
| | `GET /v1/auth/keys` | 発行済みキー一覧（秘密は返さない） |
| | `DELETE /v1/auth/keys/:id` | キー失効 |
| **記事** | `POST /v1/posts` | 記事作成（title, content, slug?） |
| | `GET /v1/posts` | 一覧（?status=published） |
| | `GET /v1/posts/:id` | 取得（生Markdownのみ返す） |
| | `PUT /v1/posts/:id` | 記事更新 |
| | `DELETE /v1/posts/:id` | 記事削除 |
| | `POST /v1/posts/:id/publish` | 公開 |
| **画像** | `POST /v1/assets` | 画像アップロード（multipart, **type=image のみ**） |
| | `GET /v1/assets` | 画像一覧 |
| | `GET /v1/assets/:id` | 画像取得 |
| | `DELETE /v1/assets/:id` | 画像削除 |

公開記事は `https://{user}.cliblog.com/{slug}` で直接アクセス。

### v1.0 で入れるもの

| 機能 | 説明 |
|------|------|
| 記事 CRUD | 作成・取得・更新・削除 |
| 下書き/公開 | status管理、publish |
| APIキー管理 | 発行・一覧・失効 |
| 画像アップロード | type=image のみ |
| サブドメイン配信 | `user.cliblog.com`（動的レンダリング） |
| ユーザー管理 | 手動登録（内部API経由） |

### v1.0 で入れないもの

| 削除対象 | 理由 |
|----------|------|
| タグ機能 | 将来拡張（**カラムは保持**） |
| RSS / sitemap | 将来追加 |
| OGP 自動生成 | 将来追加 |
| Mermaid レンダリング | v2以降で再導入検討 |
| `resolveAssets` パラメータ | 将来仕様へ移動 |
| テーマ切替 | default固定 |
| Web UI / ダッシュボード | APIファースト |
| MCP Server / GPTs Action | curl で十分、将来追加 |
| 画像最適化（WebP変換等） | そのまま配信 |

### 将来（v2以降）

| 機能 | 説明 |
|------|------|
| SSG（静的サイト生成） | 動的 → SSG 移行 |
| カスタムドメイン | `blog.example.com` |
| テーマ切り替え | default / minimal / dark |
| RSS / sitemap | 自動生成 |
| MCP Server | Claude Code 連携 |
| GPTs Action | ChatGPT 連携 |
| 課金 | Stripe連携 |
| Web Dashboard | APIキー発行UI |

### やらないこと

| 機能 | 理由 |
|------|------|
| **AI組み込み** | AIは外部ツール（Claude Code等）に任せる。このサービスはAPIのみ提供。 |
| **独自CLI** | `blog post` のようなコマンドは提供しない。curl や AI ツールで十分。 |
| **Webエディタ** | ブラウザで記事を書くUIは提供しない。APIファースト。 |
| OGP自動生成 | ユーザーが画像を選択する |
| WYSIWYG | Markdown専用 |
| 収益化機能 | 広告、有料記事は対象外 |

---

## フェデレーション ロードマップ

> **v1.0 では実装しないが、ビジョンとしてユーザーに提示する。**

| バージョン | レベル | 内容 |
|-----------|--------|------|
| **v1.0** | L0 | サブドメイン (`user.cliblog.com`) のみ |
| **v1.x** | L1: データポータビリティ | Markdown 完全エクスポート、いつでも別サービスへ移行可 |
| **v2.x** | L2: カスタムドメイン | 自分のドメイン (`blog.example.com`) で運用 |
| **v2.x** | L3: セルフホスト互換 | 同じ API 仕様でセルフホストしても動く |
| **将来** | L4: AT Protocol 的 | 複数サーバー間でアイデンティティ移行可能 |

**v1.0 での設計原則:**
- データは完全にユーザーのもの（Markdown 生保存）
- 将来のカスタムドメイン対応を妨げない設計
- OpenAPI で API 仕様を公開（セルフホスト互換の布石）

---

## v1.0 レンダリング戦略：動的レンダリング

**結論: v1.0 は動的レンダリング**

理由は「最小構成・運用コスト・失敗しにくさ」の3点で有利だから。

### 動的レンダリング（v1.0 に最適）

| 利点 | 説明 |
|------|------|
| 実装が最小 | ビルド/キュー/再生成の仕組み不要 |
| 整合性が簡単 | 更新→即反映、失敗時の補償が要らない |
| 試行錯誤が速い | Markdown/Asset仕様の変更に強い |
| CLI-firstと相性良い | 更新の即時性が価値になる |

### SSG（v2 以降で強い）

| 利点 | 説明 |
|------|------|
| 配信コスト最小 | R2 + CDNで軽い |
| 大規模トラフィックに強い | 静的ファイル配信 |
| 検索やSEOの安定性 | 事前生成済み |

**ただし**: ビルドパイプライン/ジョブ/再生成/失敗時の整合性が重くなる

### ロードマップ

```
v1.0: 動的レンダリング + CDN キャッシュ
      └─ Workers で Markdown → HTML をリクエスト時に変換
      └─ Cache-Control で CDN キャッシュ活用

v2以降: 必要になったら SSG へ移行
        └─ 移行パスを設計に残しておく
        └─ BuildScheduler (Durable Objects) はこの時点で導入
```

### 【付録】動的 → SSG 切り替え設計（v2以降）

> ⚠️ **注意**: このセクションは v2 以降の参考資料です。
> v1.0 では動的レンダリングのみ。詳細な SSG 設計は v2 設計時に別ドキュメントで策定。

**v1.0 で押さえておく設計原則のみ:**

1. **URL は固定**: `https://{user}.cliblog.com/{slug}` は v1→v2 で変えない
2. **配信ルート**: `try static → fallback dynamic`（v2 で SSG 有効化しても動的が常に fallback）
3. **"SSG はキャッシュ、動的は真実"**: 運用事故で SSG が壊れても動的で常に出せる

---

## 設計決定事項（後戻り不可）

| 項目 | 決定 | 理由 |
|------|------|------|
| **ID体系** | UUIDv7 | 時刻順ソート、RFC 9562標準、分散環境で衝突なし |
| **記事URL** | `/{slug}` | シンプル、SEO良い（user単位ユニーク制約） |
| **ブログURL** | `{user}.cliblog.com` | 独立感、カスタムドメイン移行しやすい |
| **API versioning** | `/v1/...` | 明示的、AI/GPTsが扱いやすい |
| **テナント** | シングルDB + user_id | シンプル、将来sharding可 |
| **Markdown** | GFM準拠 | フロントマターはオプション |
| **認証** | APIキー（HMAC+keyId） | AI連携に最適、高速検証 |
| **DB** | Cloudflare D1 | エッジ最速、Cloudflare統一 |
| **ORM** | Drizzle | D1対応、型安全 |
| **レンダリング** | 動的（v1.0） | 最小構成、即時反映 |
| **ユーザー登録** | 招待制/手動 | スパム防止 |

---

## システムアーキテクチャ（v1.0: 動的レンダリング）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              クライアント                                    │
│                                                                             │
│   Claude Code ───┐                                                          │
│                  │     ┌──────────────────┐                                 │
│   ChatGPT ───────┼────→│  REST API        │                                 │
│                  │     │  /v1/posts       │                                 │
│   curl ──────────┘     │  /v1/assets      │                                 │
│                        │  /v1/auth/...    │                                 │
│                        └──────────────────┘                                 │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    API Layer (Cloudflare Workers + Hono)                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Middleware Chain                                                   │    │
│  │  1. Error Handler                                                   │    │
│  │  2. Rate Limiter (階層的: IP/APIキー/ユーザー/グローバル)           │    │
│  │  3. Auth (APIキー: keyId検索 → HMAC検証 → permissions確認)          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Endpoints:                                                                 │
│  ┌─────────────────────┬─────────────────────┬────────────────────────┐    │
│  │ Auth                │ Posts               │ Assets / Other         │    │
│  │ POST /v1/auth/keys  │ GET    /v1/posts    │ POST /v1/assets        │    │
│  │ GET  /v1/auth/keys  │ POST   /v1/posts    │ GET  /v1/assets        │    │
│  │ DEL  /v1/auth/keys/:id│ GET  /v1/posts/:id │ GET  /v1/assets/:id    │    │
│  │                     │ PUT    /v1/posts/:id│ DEL  /v1/assets/:id    │    │
│  │                     │ DELETE /v1/posts/:id│ GET  /v1/me            │    │
│  │                     │ POST /v1/posts/:id/publish │ GET /health     │    │
│  └─────────────────────┴─────────────────────┴────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Dynamic Renderer (v1.0)                                            │    │
│  │  1. D1 → 記事メタデータ取得                                         │    │
│  │  2. R2 /content/ → Markdown取得                                     │    │
│  │  3. Markdown → HTML変換 + DOMPurify                                 │    │
│  │  4. テンプレート適用 + CSP                                          │    │
│  │  5. Cache-Control: s-maxage=60, stale-while-revalidate=30          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
┌───────────────────────────────┐  ┌─────────────────────────────────────────┐
│       Cloudflare D1           │  │            Cloudflare R2                │
│                               │  │                                         │
│  users                        │  │  /content/{user_id}/{post_id}.md        │
│  api_keys                     │  │                                         │
│  posts (metadata)             │  │  /assets/{user_id}/{asset_id}.{ext}     │
│  assets (metadata)            │  │                                         │
│                               │  │  ※ v1.0 では /sites/ は使用しない       │
│  ※ tags カラムは将来拡張の   │  │    （動的レンダリングのため）            │
│    ため保持、v1.0では未使用   │  │                                         │
└───────────────────────────────┘  └─────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Delivery Layer                                     │
│                                                                             │
│   user.cliblog.com  ────→  Dynamic Renderer (CDN cached)                    │
│   img.cliblog.com   ────→  R2 /assets/ 直接配信                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ID設計

### UUIDv7

```
形式: 018f3b1c-7f3e-7000-8000-000000000000
      └──────┘ └──────────────────────────┘
      timestamp      random

生成: uuidv7 パッケージ使用
特徴: 時刻順ソート可能、分散環境で衝突なし
```

### APIキー形式

```
フォーマット: sk_blog_{keyId}_{secret}
例: sk_blog_018f3b1c7f3e_a1b2c3d4e5f6...

keyId: UUIDv7 (ハイフンなし、12文字)
secret: ランダム文字列 (32文字)
```

**検証方式: HMAC-SHA256**

bcryptはWorkersのCPU制限で遅いため、HMACで高速検証。

```typescript
// キー生成
const keyId = uuidv7().replace(/-/g, '').slice(0, 12);
const secret = crypto.randomUUID().replace(/-/g, '');
const apiKey = `sk_blog_${keyId}_${secret}`;

// 保存: HMAC署名
const signature = await crypto.subtle.sign(
  'HMAC',
  await getHmacKey(env.API_KEY_SECRET),
  new TextEncoder().encode(secret)
);
// DB には keyId と signature を保存

// 検証 (bcryptより100倍以上速い)
const [, keyId, secret] = apiKey.match(/^sk_blog_([^_]+)_(.+)$/);
const record = await db.select().from(apiKeys).where(eq(apiKeys.keyId, keyId)).get();
const valid = await verifyHmac(secret, record.signature, env.API_KEY_SECRET);
```

---

## データモデル

### D1 Schema (Drizzle)

```typescript
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Users
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),                    // UUIDv7
  email: text('email').unique(),                  // 任意・ログインには使わない
  subdomain: text('subdomain').notNull().unique(),
  theme: text('theme').default('default'),
  settings: text('settings').default('{}'),       // JSON
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// API Keys
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyId: text('key_id').notNull().unique(),    // sk_blog_{keyId}_xxx の keyId 部分
  signature: text('signature').notNull(),      // HMAC署名 (Base64)
  permissions: text('permissions').default('posts:read,posts:write,posts:publish'),
  lastUsedAt: text('last_used_at'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  keyIdIdx: uniqueIndex('idx_api_keys_key_id').on(table.keyId),
  userIdx: index('idx_api_keys_user').on(table.userId),
}));

// Posts (metadata only, content in R2)
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  contentKey: text('content_key').notNull(),      // R2 key
  excerpt: text('excerpt'),
  tags: text('tags').default('[]'),               // JSON array ※v1.0では未使用、将来拡張のため保持
  status: text('status').default('draft'),        // draft | published
  publishedAt: text('published_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  userStatusIdx: index('idx_posts_user_status').on(table.userId, table.status),
  userSlugUnique: uniqueIndex('idx_posts_user_slug').on(table.userId, table.slug), // UNIQUE制約
}));

// Assets (v1.0: 画像のみ)
// → 詳細は「コンテンツ仕様」セクション参照
```

### R2 バケット構成（v1.0）

```
blog-content (private)
  content/{user_id}/{post_id}.md

blog-assets (private → public 配信)
  assets/{user_id}/{asset_id}.{ext}   # 画像: .png, .jpg, .webp

※ v1.0 では blog-sites は使用しない（動的レンダリングのため）
※ Mermaid (.mmd) は v1.0 では対応しない（v2以降で再導入検討）
```

---

## コンテンツ仕様

### Markdown

- 投稿本文は常に **Markdown**
- **生Markdownを保存**（改変しない）
- GFM（GitHub Flavored Markdown）準拠
- GET /v1/posts/:id は **生Markdownのみ返す**

### アセット参照（v1.0）

v1.0 では画像のみ対応:

```markdown
<!-- 画像埋め込み -->
![キャプション](asset:ASSET_ID)
```

※ Mermaid は v1.0 では対応しない（v2以降で再導入検討）
※ `resolveAssets` パラメータは v1.0 では提供しない（将来仕様）

### Assets テーブル

```typescript
export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),                   // UUIDv7
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: text('post_id').references(() => posts.id, { onDelete: 'set null' }),
  type: text('type').notNull(),                  // v1.0: 'image' のみ
  filename: text('filename').notNull(),
  r2Key: text('r2_key').notNull(),
  mimeType: text('mime_type'),                   // 'image/png', 'image/jpeg', etc.
  sizeBytes: integer('size_bytes'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  userIdx: index('idx_assets_user').on(table.userId),
  postIdx: index('idx_assets_post').on(table.postId),
}));
```

### アセットAPI

```
POST   /v1/assets              # アップロード（type=image のみ）
GET    /v1/assets              # 一覧
GET    /v1/assets/:id          # 取得
DELETE /v1/assets/:id          # 削除
```

**アップロード:**
```bash
curl -X POST https://api.cliblog.com/v1/assets \
  -H "Authorization: Bearer sk_blog_xxx" \
  -F "file=@image.png" \
  -F "type=image"
```

**レスポンス:**
```json
{
  "data": {
    "id": "018f3b1c-...",
    "type": "asset",
    "attributes": {
      "assetType": "image",
      "filename": "image.png",
      "url": "https://img.cliblog.com/018f3b1c-....png",
      "markdownRef": "![](asset:018f3b1c-...)"
    }
  }
}
```

---

## セキュリティ

### XSS対策（Dynamic Renderer）

**v1.0 実装: ホワイトリスト型サニタイザー**

```typescript
import { marked } from 'marked';

// Markdown → HTML 変換
const rawHtml = await marked.parse(markdown);

// カスタムサニタイザー（軽量・Workers最適化）
function sanitizeHtml(html: string): string {
  // script タグ除去
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // イベントハンドラ除去
  html = html.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  // javascript: URL 無効化
  html = html.replace(/href\s*=\s*["']?\s*javascript:[^"'>]*/gi, 'href="#"');
  return html;
}

// asset:ID → 実URL 変換
function resolveAssetRefs(html: string, assetBaseUrl: string): string {
  return html.replace(
    /src="asset:([a-z0-9-]+)"/gi,
    (_, id) => `src="${assetBaseUrl}/${id}.png"`
  );
}
```

**許可タグ（参照用）:**
`h1-h6, p, br, hr, ul, ol, li, blockquote, pre, code, a, strong, em, del, s, table, thead, tbody, tr, th, td, img`

### CSPヘッダー

**v1.0 実装済み:**

```
Content-Security-Policy: default-src 'self'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Cache-Control: public, s-maxage=60, stale-while-revalidate=30
```

### APIキー漏洩対策

- **生成時のみ表示**: 発行後は二度と取得できない
- **ログに記録しない**: アクセスログにもマスク
- **定期的なローテーション推奨**: 古いキーは失効させる

### 権限管理（Minimum Privilege）

**権限一覧:**
| 権限 | 説明 |
|------|------|
| `posts:read` | 記事の閲覧 |
| `posts:write` | 記事の作成・更新・削除 |
| `posts:publish` | 記事の公開 |
| `assets:read` | アセットの閲覧 |
| `assets:write` | アセットのアップロード・削除 |
| `keys:manage` | API キーの発行・一覧・削除 |

**keys:manage 必須:**
- `/v1/auth/keys` の全操作（POST/GET/DELETE）には `keys:manage` 権限が必要
- 登録時の初期キーには全権限が付与される
- `/v1/auth/keys` で新規作成時のデフォルトには `keys:manage` を含めない（安全デフォルト）

**権限エスカレーション防止:**
```typescript
// 新規キー作成時、要求された権限が呼び出し元キーの部分集合かチェック
function canGrantPermissions(callerPerms: string, requestedPerms: string[]): boolean {
  const callerPermList = callerPerms.split(',').map(p => p.trim());
  return requestedPerms.every(p => callerPermList.includes(p));
}
```

- 呼び出し元キーが持っていない権限は付与できない
- 例: `posts:read,posts:write` のキーで `keys:manage` を含むキーは作成不可
- 違反時は `auth.privilege_escalation` (403) エラー

### CORS

```
マネージド: *.cliblog.com に制限（* は使わない）
セルフホスト: 自分のドメインを設定
```

### WAF / Bot Management

```
Cloudflare の無料機能を有効化推奨:
- Bot Fight Mode: ON
- Security Level: Medium
- Challenge Passage: 30 minutes
```

### D1/R2 整合性（Outboxパターン）

D1（メタデータ）とR2（本文）の整合性を保証するため、Outboxパターンを採用。

```typescript
// 1. D1 に post を pending_content 状態で保存
await db.insert(posts).values({
  ...postData,
  status: 'pending_content',
});

// 2. R2 に本文を保存
await r2.put(contentKey, content);

// 3. D1 の status を draft に更新
await db.update(posts)
  .set({ status: 'draft' })
  .where(eq(posts.id, postId));

// 失敗時: Cron Worker で pending_content を検出 → 補償処理
```

**Outbox テーブル:**

```typescript
export const outbox = sqliteTable('outbox', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(), // 'post', 'image'
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),          // 'create', 'update', 'delete'
  status: text('status').default('pending'), // pending, completed, failed
  retryCount: integer('retry_count').default(0),
  createdAt: text('created_at').notNull(),
});
```

---

## API仕様

### 認証

```
Header: Authorization: Bearer sk_blog_xxxxx...
```

### レスポンス形式

**成功時:**
```json
{
  "data": {
    "id": "018f3b1c-...",
    "type": "post",
    "attributes": {
      "title": "Hello World",
      "slug": "hello-world",
      "status": "published"
    }
  }
}
```

**一覧時:**
```json
{
  "data": [...],
  "meta": { "total": 42, "limit": 20, "offset": 0 }
}
```

**エラー時:**
```json
{
  "errors": [{
    "code": "posts.slug_conflict",
    "status": 409,
    "title": "Conflict",
    "detail": "Slug already exists"
  }]
}
```

### エラーコード

```
auth.invalid_key              # 401
auth.insufficient_permissions # 403
posts.not_found               # 404
posts.slug_conflict           # 409
rate_limit.exceeded           # 429
internal.server_error         # 500
```

---

## Rate Limit

### 階層的制限

| スコープ | 制限 | ウィンドウ | 用途 |
|---------|------|-----------|------|
| IP (未認証) | 20 req | 1分 | ブルートフォース防止 |
| APIキー | 50 req | 1分 | 通常利用 |
| ユーザー (全キー合計) | 100 req | 1分 | 複数キー乱用防止 |
| グローバル (D1カウンター) | 10,000 req | 1分 | サービス保護 |

### セキュリティ対策

```typescript
// キー総当たり対策
// - keyId不一致は即座に拒否（DB問い合わせしない）
// - 無効なキーは5回失敗でIP一時ブロック（15分）
// - 成功時は last_used_at を更新

// レスポンスヘッダー
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1706799600
```

---

## Slug生成ルール

```typescript
function generateSlug(title: string, existingSlugs: string[]): string {
  let base = slugify(title, { lower: true, strict: true });

  // 日本語のみの場合はUUIDv7先頭8文字
  if (!base) base = uuidv7().slice(0, 8);

  // 60文字制限
  base = base.slice(0, 60);

  // 重複時は -n 付与
  let slug = base;
  let counter = 1;
  while (existingSlugs.includes(slug)) {
    slug = `${base}-${counter++}`;
  }

  return slug;
}
```

---

## 【将来仕様】MCP Server ツール（v2以降）

> ⚠️ **注意**: このセクションは v2 以降の参考資料です。
> v1.0 では MCP Server / GPTs Action は提供しません。curl で十分です。

v2 以降で実装予定の MCP ツール:
- `create_and_publish_post` - 記事作成・公開
- `list_posts` / `get_post` - 記事一覧・取得
- `upload_asset` - 画像アップロード（type=image のみ）

---

## 【将来仕様】Durable Object: BuildScheduler（v2以降）

> ⚠️ **注意**: このセクションは v2 以降の参考資料です。
> v1.0 では動的レンダリングのため、BuildScheduler は使用しません。

v2 で SSG を導入する際に実装予定。
詳細な設計は v2 設計時に別ドキュメントで策定。

---

## セルフホスト

### 必要なもの
- Cloudflare アカウント（Workers Paid プラン推奨）
- Node.js 20+
- pnpm

### セットアップ

```bash
# 1. クローン
git clone https://github.com/xxx/headless-blog
cd headless-blog
pnpm install

# 2. Cloudflare リソース作成
wrangler d1 create headless-blog
wrangler r2 bucket create headless-blog-content
wrangler r2 bucket create headless-blog-assets

# 3. 環境変数
cp .env.example .env
# D1_DATABASE_ID 等を設定

# 4. マイグレーション
pnpm db:migrate

# 5. デプロイ
pnpm deploy

# 6. 初期ユーザー作成
curl -X POST https://your-api.workers.dev/internal/users \
  -H "X-Internal-Key: $INTERNAL_KEY" \
  -d '{"email": "you@example.com", "subdomain": "you"}'  # email は任意
```

### 環境変数

```bash
INTERNAL_KEY=          # 内部API用シークレット
API_KEY_SECRET=        # APIキーHMAC用シークレット
D1_DATABASE_ID=        # D1データベースID
R2_CONTENT_BUCKET=     # コンテンツ用バケット名
R2_ASSETS_BUCKET=      # 画像用バケット名
SERVICE_DOMAIN=        # サブドメインのベースドメイン（例: cliblog.com）
```

---

## ディレクトリ構成

```
blog/
├── README.md
├── LICENSE                    # MIT
├── ARCHITECTURE.md
├── CONTRIBUTING.md
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── drizzle.config.ts
│
├── apps/
│   └── api/                   # Core API (v1.0)
│       ├── src/
│       │   ├── index.ts
│       │   ├── routes/v1/
│       │   │   ├── auth.ts
│       │   │   ├── posts.ts
│       │   │   ├── assets.ts      # ※ images.ts ではなく assets.ts
│       │   │   └── users.ts
│       │   ├── middleware/
│       │   │   ├── auth.ts
│       │   │   ├── rateLimit.ts
│       │   │   └── error.ts
│       │   ├── services/
│       │   │   ├── posts.ts
│       │   │   ├── assets.ts
│       │   │   └── auth.ts
│       │   ├── lib/
│       │   │   ├── db.ts
│       │   │   ├── r2.ts
│       │   │   ├── renderer.ts    # 動的レンダリング
│       │   │   └── id.ts          # UUIDv7 generator
│       │   └── templates/         # HTMLテンプレート
│       ├── wrangler.toml
│       └── package.json
│
├── packages/
│   └── db/                    # Drizzle schema + migrations
│       ├── src/schema.ts
│       ├── migrations/
│       └── package.json
│
└── docs/
    ├── api.md
    └── openapi.yaml

# ※ v2 以降で追加予定:
# ├── apps/ssg/              # SSG Worker
# └── apps/mcp-server/       # MCP Server
```

---

## ライセンス

MIT License - [LICENSE](./LICENSE) を参照
