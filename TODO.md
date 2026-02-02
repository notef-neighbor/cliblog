# CLIBLOG TODO

## v1.0 実装状況

- [x] 認証 API（HMAC + keyId）
- [x] D1 マイグレーション
- [x] Posts API（CRUD + publish）
- [x] Assets API（画像アップロード）
- [x] 動的レンダリング（Markdown → HTML）
- [x] サブドメインルーティング
- [x] vitest 自動化
- [x] ドキュメント更新
- [x] 本番デプロイ
- [ ] 独自ドメイン設定
- [ ] Rate Limit（v1.0 スコープ外）

---

## 作業履歴

### 2026-02-02: 公開画像エンドポイント追加

**詳細:** `.claude/logs/2026-02-02-public-assets-endpoint.md`

- `GET /assets/:id` で認証なし画像配信
- Cache-Control: immutable (1年キャッシュ)
- ETag / 304 対応
- ブラウザで画像表示確認済み

### 2026-02-02: 本番デプロイ

**詳細:** `.claude/logs/2026-02-02-production-deploy.md`

- Cloudflare アカウント設定（R2 有効化、workers.dev 登録）
- D1/R2 リソース作成
- シークレット設定（INTERNAL_KEY, API_KEY_SECRET）
- wrangler deploy 完了
- テストユーザー作成・API キー発行・記事投稿確認
- API URL: https://cliblog-api.notef.workers.dev

### 2026-02-02: vitest 自動化 & ドキュメント更新

**詳細:** `.claude/logs/2026-02-02-vitest-docs-update.md`

- vitest + @cloudflare/vitest-pool-workers でテスト環境構築
- renderer.test.ts（24件）、public.test.ts（17件）作成
- D1 テスト用スキーマセットアップ実装
- ARCHITECTURE.md に v1.0 実装状況追加
- docs/api.md に認証 API・公開ページ・Markdown 記法セクション追加
- 全 41 テスト passing
