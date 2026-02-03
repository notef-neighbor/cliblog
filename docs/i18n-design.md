# 多言語対応 設計ドキュメント (v1.1)

## 概要

投稿時に翻訳を生成し、閲覧者の言語に応じて自動切替する機能。

## 決定事項

| 項目 | 決定 |
|------|------|
| 翻訳未生成時の表示 | 「翻訳準備中」メッセージを表示 + 原文リンク |
| 翻訳対象言語 | アカウント設定 + 投稿時に上書き可能 |
| 公開状態 | 原文と常に連動 |
| 既存データの locale | NULL 許容、フォールバックは `ja` |
| pending 管理 | DB にプレースホルダー行を作成 |
| GET /v1/posts/:id | 常に同一リソースを返却、locale は別エンドポイント |
| slug 一意性 | `(user_id, slug, locale)` で一意 |

---

## DB スキーマ

### posts テーブル変更

```sql
-- カラム追加
ALTER TABLE posts ADD COLUMN locale TEXT;
ALTER TABLE posts ADD COLUMN original_post_id TEXT REFERENCES posts(id);
ALTER TABLE posts ADD COLUMN translation_status TEXT DEFAULT 'ready'
  CHECK (translation_status IN ('pending', 'ready', 'failed'));
ALTER TABLE posts ADD COLUMN source_revision TEXT;  -- ISO-8601 形式の updated_at
ALTER TABLE posts ADD COLUMN translated_at TEXT;
ALTER TABLE posts ADD COLUMN translation_locked INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN last_translation_error TEXT;

-- 翻訳の一意制約（同一原文に同一言語の翻訳は1つ）
CREATE UNIQUE INDEX idx_posts_translation
  ON posts(original_post_id, locale)
  WHERE original_post_id IS NOT NULL;

-- slug の一意制約（user_id, slug, locale で一意、slug が NULL の pending は除外）
CREATE UNIQUE INDEX idx_posts_slug_locale
  ON posts(user_id, slug, locale)
  WHERE slug IS NOT NULL;
```

### users テーブル変更

```sql
ALTER TABLE users ADD COLUMN default_translation_locales TEXT;
-- JSON 配列: ["en", "zh"] など
```

### カラム説明

| カラム | 型 | 説明 |
|--------|-----|------|
| `locale` | TEXT | 投稿の言語コード（"ja", "en", "zh" など）。NULL = 旧データ（`ja` として扱う） |
| `original_post_id` | TEXT | 翻訳元の投稿ID。NULL = 原文 |
| `translation_status` | TEXT | `pending` / `ready` / `failed`。CHECK 制約あり |
| `source_revision` | TEXT | 翻訳元の `updated_at`（UTC 固定、`YYYY-MM-DDTHH:MM:SS.sssZ` 形式）。文字列比較で時刻順を保証 |
| `translated_at` | TEXT | 翻訳生成日時（ISO-8601 形式） |
| `translation_locked` | INTEGER | 1 = 手動編集済み、自動再翻訳を抑止 |
| `last_translation_error` | TEXT | 翻訳失敗時のエラーメッセージ |

### 旧データの扱い

- `locale = NULL` の投稿は `ja`（日本語）として扱う
- 表示・SEO・フォールバックすべてで `ja` を適用

---

## API 設計

### POST /v1/posts

```json
{
  "title": "記事タイトル",
  "content": "...",
  "locale": "ja",
  "translate_to": ["en", "zh"]
}
```

**処理フロー:**
1. 原文を作成
2. `translate_to` 各言語に対してプレースホルダー行を作成:
   - `translation_status = 'pending'`
   - `source_revision = original.updated_at`
   - `title = NULL`, `content = NULL`, `slug = NULL`
   - `original_post_id = original.id`
3. レスポンス返却

**レスポンス:**
```json
{
  "data": {
    "id": "original-id",
    "attributes": {
      "locale": "ja",
      "translations": [
        { "locale": "en", "status": "pending", "id": "translation-id-en" },
        { "locale": "zh", "status": "pending", "id": "translation-id-zh" }
      ]
    }
  }
}
```

### PUT /v1/posts/:id

原文を更新すると、`translation_locked = 0` の翻訳の `translation_status` を `pending` に戻す。

```json
{
  "content": "更新内容..."
}
```

**処理フロー:**
1. 原文を更新（`updated_at` 更新）
2. 関連翻訳で `translation_locked = 0` のものを検索
3. 該当翻訳の `translation_status = 'pending'` に更新（`source_revision` は保持）
4. レスポンス返却（即座）
5. Skill 側でバックグラウンド翻訳
6. 翻訳完了時に `source_revision = original.updated_at` を更新

### GET /v1/posts/:id

**常に指定された ID の投稿のみを返却。**

- `locale` パラメータは無視（または 400 エラー）
- 翻訳を取得したい場合は `/translations` エンドポイントを使用

```json
{
  "data": {
    "id": "...",
    "attributes": {
      "title": "...",
      "locale": "ja",
      "translation_status": "ready",
      "translations": [
        { "locale": "en", "status": "ready", "id": "..." },
        { "locale": "zh", "status": "pending", "id": "..." }
      ]
    }
  }
}
```

### GET /v1/posts/:id/translations

原文に紐づく翻訳の一覧を取得。

```json
{
  "data": [
    { "id": "...", "locale": "en", "status": "ready", "translated_at": "..." },
    { "id": "...", "locale": "zh", "status": "pending", "translated_at": null }
  ]
}
```

### GET /v1/posts/:id/translations/:locale

特定言語の翻訳を取得。

- `status = ready`: 翻訳内容を返却
- `status = pending`: `{ "status": "pending" }` を返却
- 存在しない: 404

### GET /b/:subdomain/:slug

**locale 決定の優先順位:**
1. クエリパラメータ `?lang=en`（最優先）
2. Accept-Language ヘッダー
3. 原文の locale（NULL の場合は `ja`）

**ルーティングロジック:**
1. `(user_id, slug, locale)` で厳密検索
2. 見つからなければ原文（`original_post_id IS NULL` かつ同一 slug）にフォールバック
3. それでもなければ 404

**翻訳が pending の場合:**
```html
<div class="translation-pending">
  <p>This article is being translated. Please wait a moment.</p>
  <p><a href="?lang={{original.locale}}">Read in {{original.locale_name}} (original)</a></p>
</div>
```

※ `original.locale` と `original.locale_name`（例: "ja" → "Japanese"）は動的に出し分け

**キャッシュヘッダー:**
```http
Vary: Accept-Language
Cache-Control: public, max-age=300
```

`?lang=` 指定時は `Vary` なしでキャッシュ可能。

---

## URL / SEO 設計

### URL 構造

```
/b/notf/my-first-post          → Accept-Language で自動選択
/b/notf/my-first-post?lang=ja  → 日本語を強制（キャッシュ可能）
/b/notf/my-first-post?lang=en  → 英語を強制（キャッシュ可能）
```

### slug の扱い

- **slug は `(user_id, slug, locale)` で一意**
- 翻訳は原文と同じ slug でも、別の slug でも可
- 例:
  - 原文 (ja): `hajimete-no-oss`
  - 英訳 (en): `my-first-oss`（SEO 最適化のため変更可）

### canonical / hreflang

```html
<!-- 原文（日本語） -->
<link rel="canonical" href="https://blog.dreamcore.gg/b/notf/hajimete-no-oss?lang=ja">
<link rel="alternate" hreflang="ja" href="...?lang=ja">
<link rel="alternate" hreflang="en" href="/b/notf/my-first-oss?lang=en">
<link rel="alternate" hreflang="x-default" href="/b/notf/hajimete-no-oss">
```

`original_post_id` を使って関連翻訳を取得し、hreflang を生成。

---

## 翻訳フロー

### 投稿時

```
User: 「記事を投稿して、英語と中国語に翻訳して」
  ↓
Skill: POST /v1/posts (locale=ja, translate_to=[en, zh])
  ↓
API: 原文を作成
API: 翻訳プレースホルダーを作成 (status=pending, content=NULL)
API: レスポンス返却
  ↓
Skill: 「投稿しました！翻訳中...」
  ↓
Skill: Claude で英語に翻訳 → PUT /v1/posts/:translation_id_en
  ↓
Skill: Claude で中国語に翻訳 → PUT /v1/posts/:translation_id_zh
  ↓
Skill: 「翻訳完了！」
```

### 編集時

```
User: 「記事を編集して」
  ↓
Skill: PUT /v1/posts/:original_id (content=...)
  ↓
API: 原文を更新
API: 翻訳 (locked=0) の status を pending に
API: レスポンス返却
  ↓
Skill: 「更新しました！翻訳も更新中...」
  ↓
Skill: GET /v1/posts/:original_id/translations で pending 翻訳を取得
  ↓
Skill: 各翻訳を Claude で再生成 → PUT /v1/posts/:translation_id
  ↓
Skill: 「翻訳更新完了！」
```

### 整合性検証

翻訳更新時:
1. 原文の `updated_at` を取得
2. 翻訳の `source_revision` と比較
   - 形式: UTC 固定 `YYYY-MM-DDTHH:MM:SS.sssZ`（例: `2026-02-03T14:30:00.000Z`）
   - 文字列比較で時刻順が保証される
3. `source_revision < original.updated_at` なら「原文が更新されています。最新版で再翻訳しますか？」と確認
4. 翻訳完了時に `source_revision = original.updated_at` を保存

**注意:** `source_revision` は pending 中も保持する。NULL にしない。

---

## エッジケース

### 同時編集・連続編集

- `source_revision` で整合性を検証
- 翻訳更新前に原文が再更新された場合、翻訳は最新版に対して行う
- 古い `source_revision` の翻訳リクエストは警告を出す

### 翻訳の手動編集

1. ユーザーが翻訳を直接編集
2. `translation_locked = 1` に設定
3. 以降の自動再翻訳をスキップ
4. ユーザーが明示的に「再翻訳して」と言えば `locked = 0` に戻す

### 翻訳失敗

- `translation_status = 'failed'` に設定
- `last_translation_error` にエラー内容を保存
- Skill が「翻訳に失敗しました: {error}。再試行しますか？」と確認
- リトライ上限: 3回（Skill 側で制御）

### 旧データ (locale = NULL)

- 表示時は `ja` として扱う
- SEO: `hreflang="ja"` を出力
- 翻訳追加時: 原文の `locale` を `ja` に更新

---

## マイグレーション計画

### Phase 1: スキーマ追加

```sql
ALTER TABLE posts ADD COLUMN locale TEXT;
ALTER TABLE posts ADD COLUMN original_post_id TEXT;
ALTER TABLE posts ADD COLUMN translation_status TEXT DEFAULT 'ready'
  CHECK (translation_status IN ('pending', 'ready', 'failed'));
ALTER TABLE posts ADD COLUMN source_revision TEXT;
ALTER TABLE posts ADD COLUMN translated_at TEXT;
ALTER TABLE posts ADD COLUMN translation_locked INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN last_translation_error TEXT;

ALTER TABLE users ADD COLUMN default_translation_locales TEXT;
```

### Phase 2: インデックス追加

```sql
CREATE UNIQUE INDEX idx_posts_translation
  ON posts(original_post_id, locale)
  WHERE original_post_id IS NOT NULL;

CREATE UNIQUE INDEX idx_posts_slug_locale
  ON posts(user_id, slug, locale)
  WHERE slug IS NOT NULL;
```

### Phase 3: API 更新

- POST /v1/posts に `locale`, `translate_to` パラメータ
- PUT /v1/posts で翻訳 status を pending に
- GET /v1/posts/:id から locale パラメータを除外
- GET /v1/posts/:id/translations 追加
- GET /v1/posts/:id/translations/:locale 追加
- GET /b/:subdomain/:slug に `?lang=` 対応 + `Vary: Accept-Language`

### Phase 4: Skill 更新

- 投稿時に翻訳オプション
- プレースホルダー作成後のバックグラウンド翻訳フロー
- 編集時の自動再翻訳（locked=0 のみ）
- source_revision 整合性検証

### Phase 5: SEO

- canonical / hreflang 生成
- 翻訳準備中ページの noindex 検討

---

## テストケース

- [ ] locale 解決優先順位（`?lang` > Accept-Language > 原文）
- [ ] 翻訳未生成時の「準備中」表示と `translation_status` の整合
- [ ] `translation_locked = 1` のときに自動再翻訳がスキップされる
- [ ] `(user_id, slug, locale)` 重複時のエラー
- [ ] 旧データ `locale = NULL` の表示（`ja` として扱う）
- [ ] `Vary: Accept-Language` ヘッダーの出力
- [ ] `?lang=` 指定時に `Vary` なし

---

## 未決定事項

- [ ] サポートする言語の一覧（ja, en, zh, ko, fr, de, es, ...?）
- [ ] 翻訳失敗時のリトライ回数上限（現在 Skill 側で 3回）
- [ ] 翻訳 API の将来的な移行（Claude → DeepL など）
- [ ] pending 翻訳ページの noindex 設定
