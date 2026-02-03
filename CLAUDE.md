# CLIBLOG - Project Guidelines

> AIネイティブ ヘッドレスブログサービス
> ※ CLIBLOG は仮の名前です

## プロジェクト概要

外部の AI ツール（Claude Code、ChatGPT 等）から REST API 経由で投稿できるブログサービス。
AI は組み込まれていない。シンプルな API を提供するのみ。

## 技術スタック

| 項目 | 技術 |
|------|------|
| Runtime | Cloudflare Workers |
| Framework | Hono |
| Database | Cloudflare D1 |
| Storage | Cloudflare R2 |
| ORM | Drizzle |
| Package Manager | pnpm |
| Monorepo | Turborepo |

## v1.0 方針

- **動的レンダリング**: SSG は v2 以降
- **assets 統一**: `/v1/images` ではなく `/v1/assets`
- **HMAC+keyId**: bcrypt/prefix ではなく HMAC で高速検証
- **Mermaid なし**: v1.0 では画像のみ（type=image）
- **タグなし**: カラムは保持するが API では未使用

## よく使うコマンド

```bash
# 開発サーバー起動
pnpm dev

# 型チェック
pnpm typecheck

# リント
pnpm lint

# テスト
pnpm test

# マイグレーション
pnpm db:migrate

# デプロイ
pnpm deploy
```

## ディレクトリ構成

```
blog/
├── apps/
│   └── api/          # Core API (Cloudflare Workers)
├── packages/
│   └── db/           # Drizzle schema + migrations
└── docs/             # API documentation
```

## コーディング規約

- TypeScript strict mode
- ESLint + Prettier
- 関数は小さく、単一責任
- エラーは Result 型で表現（throw より return）
- コメントは「なぜ」を書く（「何」はコードで表現）

## API 設計

- RESTful
- JSON:API 風レスポンス形式
- エラーコードは `domain.error_type` 形式（例: `posts.not_found`）

## セキュリティ

- APIキーは生成時のみ表示
- ログにキーを記録しない
- CORS は `*.cliblog.com` に制限
- CSP ヘッダーで XSS 防止

## 重要: データ復旧時の注意

**D1 と R2 は独立している。DBが消えてもR2にコンテンツが残っている可能性が高い。**

### よくあるミス

1. **DBリセット後にコンテンツが消えたと思い込む**
   - D1 (posts テーブル) が空でも、R2 (cliblog-content) にMarkdownが残っている
   - まず R2 を確認してからコンテンツ復旧を判断する

2. **翻訳データの復旧漏れ**
   - R2 の `content/{user_id}/` 配下に翻訳ファイルが存在する
   - DBレコードだけ消えた場合、R2からファイル一覧を取得してINSERTで復旧可能

### 復旧手順

```bash
# 1. R2 のコンテンツ確認（Cloudflare ダッシュボードで確認）
# cliblog-content > content/{user_id}/ 配下のファイル一覧

# 2. 各ファイルをダウンロードして内容確認
npx wrangler r2 object get cliblog-content/content/{user_id}/{post_id}.md --remote --file /tmp/{post_id}.md

# 3. DBにレコードを再作成
# - id, user_id, slug, title, excerpt, content_key, locale, original_post_id 等を設定
# - content_key は R2 のパスと一致させる
```

### 関連リソース

| リソース | 用途 |
|----------|------|
| D1: cliblog | posts, users, api_keys テーブル |
| R2: cliblog-content | Markdown コンテンツ (`content/{user_id}/{post_id}.md`) |

## 参考ドキュメント

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 詳細設計
- [CONCEPT.md](./CONCEPT.md) - プロダクトコンセプト
