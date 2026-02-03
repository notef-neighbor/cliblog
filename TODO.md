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
- [x] 独自ドメイン設定 (blog.dreamcore.gg)
- [ ] Rate Limit（v1.0 スコープ外）

---

## v1.1 計画

### 多言語対応

**設計ドキュメント:** [docs/i18n-design.md](docs/i18n-design.md)

**決定事項:**
- 翻訳未生成時 → 「翻訳準備中」表示 + 原文リンク
- 翻訳言語 → アカウント設定 + 投稿時に上書き可能
- 公開状態 → 原文と常に連動
- 既存データ → locale=NULL 許容

**実装タスク:**

Phase 1: スキーマ
- [x] posts に `locale`, `original_post_id`, `translation_status`, `source_revision`, `translated_at`, `translation_locked` 追加
- [x] users に `default_translation_locales` 追加
- [x] UNIQUE(original_post_id, locale) インデックス

Phase 2: API
- [x] POST /v1/posts に `locale`, `translate_to` パラメータ
- [x] PUT /v1/posts で翻訳 status を pending に
- [x] GET /v1/posts/:id/translations エンドポイント追加
- [x] GET /b/:subdomain/:slug に ?lang= 対応 + Accept-Language fallback
- [x] 翻訳準備中の HTML 表示

Phase 3: Skill
- [x] 投稿時に翻訳オプション追加
- [ ] バックグラウンド翻訳フロー（Skill側実装）
- [x] 編集時の自動再翻訳マーク（locked=0 のみ pending に）
- [ ] source_revision 整合性検証（Skill側実装）

Phase 4: SEO
- [x] canonical / hreflang 生成

---

## v1.2 計画

### フロントエンドデザイン

**方向性:** Oliver Reichenstein（iA）スタイル
- モノスペースフォント
- 点滅カーソル（フォーカスモード）
- 極限のシンプルさ
- 「集中して書く。静かに読む。」

**サンプル:** `design-samples/oliver-reichenstein-*.html`

**参考:**
- iA Writer のデザイン哲学
- 「手書きノートを読むような自然さ」を目指す

---

### 画像の多言語対応

現在、翻訳記事では元言語の画像がそのまま使われる。言語別の画像を紐付ける機能を検討。

**案:**
- `asset:ID?lang=xx` 形式で言語指定
- または翻訳版投稿時に言語別画像をマッピング
- API: `POST /v1/posts/:id/translations` で画像マッピングを受け付ける

---

## 作業履歴

### 2026-02-03: v1.1 多言語対応 (i18n) 実装

**詳細:** `.claude/logs/2026-02-03-i18n-implementation.md`

- DBスキーマ変更: posts に i18n カラム追加（locale, original_post_id, translation_status など）
- マイグレーション: 0002_i18n.sql, 0003_i18n_nullable.sql をローカル・本番に適用
- API: POST /v1/posts に locale, translate_to パラメータ追加
- API: PUT /v1/posts で原文更新時に翻訳を pending にマーク
- API: GET /v1/posts/:id/translations エンドポイント追加
- Blog: ?lang= パラメータと Accept-Language ヘッダー対応
- Blog: 翻訳準備中ページ表示
- SEO: canonical / hreflang タグ生成
- Skill: 翻訳オプションのドキュメント追加
- 全41テスト通過、本番デプロイ完了

### 2026-02-03: DBマイグレーション & コンテンツ復旧

**詳細:** `.claude/logs/2026-02-03-db-migration-and-recovery.md`

- email を nullable にするマイグレーション適用（本番/ローカル）
- `GET /v1/auth/check-email` エンドポイント削除
- Skill文面に「メール任意」を明示
- **コンテンツ消失問題を調査・復旧**
  - R2にmarkdownが残存、D1のpostsテーブルが空だった
  - R2から10ファイルをダウンロード、6件のpostsレコードを再作成
  - 「My First Open Source Project」含む全記事が復旧

### 2026-02-02: カスタムドメイン設定 & アカウント復旧

**詳細:** `.claude/logs/2026-02-02-custom-domain-setup.md`

- Cloudflare にドメイン追加、ネームサーバー移行
- Worker に `blog.dreamcore.gg` を接続
- notf アカウントの API キー再発行
- Skill / README の URL を新ドメインに更新
- 新 API URL: https://blog.dreamcore.gg

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
