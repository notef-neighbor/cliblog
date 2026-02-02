# 公開画像エンドポイント追加

**日付:** 2026-02-02
**作業者:** Claude

## 実施内容

### 背景
- 画像 URL が `https://img.cliblog.com/...` を返していたが、独自ドメイン未設定のため使用不可
- v1.0 の公開ページで画像を表示するために、Workers 経由で画像を配信する機能を追加

### 実装内容

1. **公開画像エンドポイント追加**
   - `GET /assets/:id` - 認証なしで画像バイナリを返す
   - D1 からメタデータ取得 → R2 からバイナリ取得 → そのまま返す

2. **レスポンスヘッダー**
   - `Content-Type`: 保存済みの mime_type
   - `Cache-Control: public, max-age=31536000, immutable`
   - `ETag`: アセット ID（イミュータブルなので固定）
   - `If-None-Match` → 304 Not Modified 対応

3. **URL 形式変更**
   - 旧: `https://img.cliblog.com/{id}.{ext}`
   - 新: `https://cliblog-api.notef.workers.dev/assets/{id}`
   - 将来 `img.cliblog.com` に差し替え可能

4. **Markdown レンダリング更新**
   - `asset:ID` 参照を `/assets/{id}` に解決するよう変更

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| src/routes/publicAssets.ts | 新規: 公開画像エンドポイント |
| src/index.ts | publicAssetsRoute を追加 |
| src/services/assets.ts | getAssetPublic() 追加、getAssetUrl() 更新 |
| src/routes/v1/assets.ts | URL 生成を API ベース URL に変更 |
| src/routes/public.ts | assetBaseUrl を動的に生成 |
| src/lib/renderer.ts | asset:ID 解決時の .png 拡張子を削除 |
| src/lib/renderer.test.ts | テスト更新 |

## 設計決定

- **ドラフト画像も公開**: URL がバレない限り問題なし（最短実装）
- **認証なし**: 画像は公開リソースとして扱う
- **イミュータブルキャッシュ**: 画像 ID は固定なので 1 年キャッシュ

## テスト結果

```
✓ GET /assets/:id → 200 OK
✓ Content-Type: image/png
✓ Cache-Control: public, max-age=31536000, immutable
✓ ETag 設定済み
✓ If-None-Match → 304 Not Modified
✓ ブラウザで画像表示確認
✓ vitest 41 tests passing
```

## 動作確認 URL

- 1x1 テスト画像: https://cliblog-api.notef.workers.dev/assets/019c1c03-34dd-72f9-a182-dd2034c35921
- 100x100 赤い四角: https://cliblog-api.notef.workers.dev/assets/019c1c12-7cee-7256-8258-8d9df0b7e227
