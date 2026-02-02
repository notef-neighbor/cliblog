# カスタムドメイン設定 & アカウント復旧

**日付:** 2026-02-02
**作業者:** Claude

## 実施内容

### 1. カスタムドメイン設定 (blog.dreamcore.gg)
- Cloudflare にドメイン `dreamcore.gg` を追加
- GoDaddy でネームサーバーを Cloudflare に変更
  - `harlee.ns.cloudflare.com`
  - `matias.ns.cloudflare.com`
- Worker に Custom Domain `blog.dreamcore.gg` を接続
- Skill と README の URL を `blog.dreamcore.gg` に更新

### 2. notf アカウント復旧
- `notf` ユーザーの API キーを内部 API で再発行
- `~/.config/cliblog/config.json` を正しいアカウントに更新
- INTERNAL_KEY を新規設定

### 3. Skill 配置の整理
- DreamCore-V2-sandbox から グローバル (`~/.claude/skills/cliblog/`) に移動
- ローカル skill ファイルの URL を更新

## 発見した問題と対応

| 問題 | 対応 |
|------|------|
| wrangler secret put 後も認証エラー | echo でパイプして再設定、デプロイで解決 |
| curl で DNS 解決できない | ローカル DNS キャッシュの問題。`--resolve` オプションで確認 |
| グローバル config が間違ったアカウント | 内部 API で新キー発行、config 書き換え |

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `apps/api/src/routes/install.ts` | API URL を `blog.dreamcore.gg` に変更 |
| `README.md` | インストール URL を `blog.dreamcore.gg` に変更 |
| `~/.claude/skills/cliblog/skill.md` | API URL を `blog.dreamcore.gg` に変更 |
| `~/.config/cliblog/config.json` | notf アカウント情報に更新 |

## 新しい URL 構成

| 用途 | URL |
|------|-----|
| API | `https://blog.dreamcore.gg` |
| ブログ | `https://blog.dreamcore.gg/b/{subdomain}` |
| Skill インストール | `curl -fsSL https://blog.dreamcore.gg/install-skill.sh \| bash` |

## 学び・注意点

- Cloudflare Worker の Custom Domain は、ドメインが Cloudflare で管理されている必要がある
- ネームサーバー変更後の DNS 伝播には時間がかかる（数分〜数時間）
- wrangler secret は設定後にデプロイが必要な場合がある
- INTERNAL_KEY は Skills には影響しない（API_KEY_SECRET は影響する）
