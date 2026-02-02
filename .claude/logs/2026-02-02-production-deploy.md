# 本番デプロイ

**日付:** 2026-02-02
**作業者:** Claude

## 実施内容

### 1. Cloudflare アカウント設定
- Cloudflare アカウント作成（Google 認証）
- R2 Object Storage 有効化（クレジットカード登録、無料枠）
- workers.dev サブドメイン登録（notef.workers.dev）

### 2. リソース作成
- D1 Database: `cliblog` (APAC リージョン)
- R2 Bucket: `cliblog-content`
- R2 Bucket: `cliblog-assets`

### 3. シークレット設定
- INTERNAL_KEY: 管理用 API キー
- API_KEY_SECRET: HMAC 署名用シークレット
- SERVICE_DOMAIN: cliblog.com

### 4. デプロイ
- wrangler deploy でデプロイ完了
- API URL: https://cliblog-api.notef.workers.dev

### 5. 動作確認
- ユーザー作成: testuser (test@example.com)
- API キー発行: sk_blog_019c1bfa2577_...
- 記事作成・公開: "Hello World"

## 発見した問題と対応

- **問題1:** R2 が有効化されていない
  → ダッシュボードから有効化（クレジットカード登録必要）

- **問題2:** workers.dev サブドメインが未登録
  → ダッシュボードから Hello World Worker を作成して登録

- **問題3:** API_KEY_SECRET が空で HMAC エラー
  → `echo` でパイプすると改行が入る問題。シンプルな文字列で再設定

- **問題4:** 公開ページに Host ヘッダーでアクセスすると 403
  → Cloudflare のセキュリティ機能。独自ドメイン設定が必要

## 作成リソース一覧

| リソース | 値 |
|---------|-----|
| API URL | https://cliblog-api.notef.workers.dev |
| D1 Database ID | a7cfb865-df28-470b-b4f9-4eee5be63041 |
| R2 Content Bucket | cliblog-content |
| R2 Assets Bucket | cliblog-assets |
| Test User ID | 019c1bf8-49a0-7c40-8af4-87bd62f477d5 |
| Test User Subdomain | testuser |

## 認証情報の保存先

`~/.env.cliblog`:
- CLIBLOG_API_KEY
- CLIBLOG_API_URL
- CLIBLOG_INTERNAL_KEY

## 残タスク

- [ ] 独自ドメイン (cliblog.com) の取得・設定
- [ ] ワイルドカードルート (*.cliblog.com) の設定
- [ ] 本番用 API_KEY_SECRET の強化（現在はテスト用の簡易値）

## 学び・注意点

- wrangler secret put はパイプで値を渡すと改行が入ることがある
- R2 は初回有効化時にクレジットカード登録が必要（無料枠あり）
- workers.dev サブドメインは事前登録が必要
- Host ヘッダーを偽装したアクセスは Cloudflare がブロックする
