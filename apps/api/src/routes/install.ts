/**
 * Skill installation endpoint
 * Serves a bash script to install the CLIBLOG skill for Claude Code
 */
import { Hono } from 'hono';
import type { Env } from '../lib/types';

export const installRoutes = new Hono<{ Bindings: Env }>();

const SKILL_CONTENT = `---
name: cliblog
description: CLIBLOG skill for Claude Code. Register, post, upload images, and manage posts via API.
---

# CLIBLOG Skill (Claude Code)

## Language policy

- Respond in the user's language (English or Japanese).
- 日本語のユーザーには日本語で返答する。
- If the language is unclear, ask which they prefer.
- Keep replies concise and action-oriented.

## Overview

CLIBLOG is a CLI-first blog API. This skill helps users register, create posts, upload images, and manage content from their own terminal.

Email is optional and **not used for login**.

## Config file

Path: \`~/.config/cliblog/config.json\`

Example:

\`\`\`json
{
  "apiUrl": "https://blog.dreamcore.gg",
  "apiKey": "sk_blog_***",
  "subdomain": "your-subdomain",
  "blogUrl": "https://your-blog.example"
}
\`\`\`

Notes:

- **Never show the API key** in output or logs.
- Always use \`blogUrl\` from the config. **Do not construct it yourself**.
- For self-hosted instances, \`apiUrl\` will be different; always read it from the config.

## Setup (registration)

When the user says "I want to start a blog" or "Register me":

0. Set \`API_URL\`:
   - If config exists, use \`config.apiUrl\`.
   - If config is missing, use the default instance (\`https://blog.dreamcore.gg\`) unless the user provided another URL.

1. Check for config:
   \`\`\`bash
   cat ~/.config/cliblog/config.json 2>/dev/null
   \`\`\`
   If config exists and has valid apiKey, skip registration.

2. If no config, ask for:
   - Subdomain (required; lowercase letters, numbers, hyphen; must start with a letter)
   - Email (optional; not used for login)

3. Call register:
   \`\`\`bash
   curl -s -X POST "\${API_URL}/v1/auth/register" \\
     -H "Content-Type: application/json" \\
     -d '{"email":"USER_EMAIL","subdomain":"USER_SUBDOMAIN"}'
   \`\`\`
   - If the user skips email, **omit the email field**.

4. Save config with the response values:
   \`\`\`bash
   mkdir -p ~/.config/cliblog
   cat > ~/.config/cliblog/config.json << 'EOF'
   {
     "apiUrl": "\${API_URL}",
     "apiKey": "RESPONSE.data.attributes.apiKey",
     "subdomain": "RESPONSE.data.attributes.subdomain",
     "blogUrl": "RESPONSE.data.attributes.blogUrl"
   }
   EOF
   \`\`\`

5. Reply with the returned \`blogUrl\` only.

## Create and publish a post

When the user asks to write or publish a post:

1. Read config (do not reveal \`apiKey\`) and set \`API_URL\` and \`API_KEY\`.
2. Generate Markdown content.
3. Create post:
   \`\`\`bash
   curl -s -X POST "\${API_URL}/v1/posts" \\
     -H "Authorization: Bearer \${API_KEY}" \\
     -H "Content-Type: application/json" \\
     -d '{
       "title": "Post title",
       "slug": "url-friendly-slug",
       "content": "# Heading\\n\\nBody..."
     }'
   \`\`\`
4. Publish:
   \`\`\`bash
   curl -s -X POST "\${API_URL}/v1/posts/\${POST_ID}/publish" \\
     -H "Authorization: Bearer \${API_KEY}"
   \`\`\`
5. Reply with:
   \`\`\`
   \${blogUrl}/\${slug}
   \`\`\`

## Image upload

If the user wants to include an image:

1. Upload asset:
   \`\`\`bash
   curl -s -X POST "\${API_URL}/v1/assets" \\
     -H "Authorization: Bearer \${API_KEY}" \\
     -F "file=@/path/to/image.png" \\
     -F "type=image"
   \`\`\`
2. Use the returned \`markdownRef\`, e.g.:
   \`\`\`markdown
   ![alt text](asset:ASSET_ID)
   \`\`\`
3. Include it in the post Markdown, then create/publish as usual.

## List posts

\`\`\`bash
curl -s "\${API_URL}/v1/posts" \\
  -H "Authorization: Bearer \${API_KEY}"
\`\`\`

## Delete a post

\`\`\`bash
curl -s -X DELETE "\${API_URL}/v1/posts/\${POST_ID}" \\
  -H "Authorization: Bearer \${API_KEY}"
\`\`\`

## Account deletion

If the user wants to delete their account:

1. Confirm explicitly: require \`delete my account\`.
2. Call:
   \`\`\`bash
   curl -s -X DELETE "\${API_URL}/v1/auth/account" \\
     -H "Authorization: Bearer \${API_KEY}" \\
     -H "Content-Type: application/json" \\
     -d '{"confirm":"delete my account"}'
   \`\`\`
3. Remove config:
   \`\`\`bash
   rm -f ~/.config/cliblog/config.json
   \`\`\`
4. Inform the user.

Note: \`account:delete\` permission is required (initial key includes it).

## API key management (optional)

If the user asks to create/rotate keys:

- Create key (requires \`keys:manage\`):
  \`\`\`bash
  curl -s -X POST "\${API_URL}/v1/auth/keys" \\
    -H "Authorization: Bearer \${API_KEY}" \\
    -H "Content-Type: application/json" \\
    -d '{"name":"Read Only","permissions":"posts:read,assets:read"}'
  \`\`\`
- List keys:
  \`\`\`bash
  curl -s "\${API_URL}/v1/auth/keys" \\
    -H "Authorization: Bearer \${API_KEY}"
  \`\`\`
- Revoke key:
  \`\`\`bash
  curl -s -X DELETE "\${API_URL}/v1/auth/keys/\${KEY_ID}" \\
    -H "Authorization: Bearer \${API_KEY}"
  \`\`\`

Never display key secrets after creation.

## Error handling

- \`auth.subdomain_taken\`: Subdomain already used.
- \`auth.invalid_email\`: Invalid email (only when provided).
- \`auth.email_taken\`: Email already registered (only when provided).
- \`auth.invalid_subdomain\`: Must be 3–30 lowercase letters, digits, hyphen, start with a letter.
- \`auth.insufficient_permissions\`: Missing required permission.
- \`auth.privilege_escalation\`: Attempted permission escalation.
- \`auth.invalid_permissions\`: Invalid permissions string.
- \`posts.not_found\`: Post not found.
- \`assets.invalid_type\`: Only \`image\` is allowed.

## Security

- Never print \`apiKey\`.
- Never echo config contents.
- Keep command output minimal.
`;

const INSTALL_SCRIPT = `#!/bin/bash
# CLIBLOG Skill Installer for Claude Code
# https://blog.dreamcore.gg
#
# Usage:
#   # プロジェクトローカル（デフォルト）
#   curl -fsSL https://blog.dreamcore.gg/install-skill.sh | bash
#
#   # グローバル（全プロジェクト共通）
#   curl -fsSL https://blog.dreamcore.gg/install-skill.sh | bash -s -- --global
#
# Safer alternative:
#   curl -fsSLO https://blog.dreamcore.gg/install-skill.sh
#   less install-skill.sh  # review the script
#   bash install-skill.sh        # local
#   bash install-skill.sh --global  # global

set -euo pipefail
umask 022

BASE_URL="https://blog.dreamcore.gg"

# Determine install location
# --global: ~/.claude/skills/cliblog (user-wide)
# --local or default: ./.claude/skills/cliblog (project-specific)
if [[ "\${1:-}" == "--global" ]]; then
  SKILL_DIR="\${CLAUDE_HOME:-$HOME/.claude}/skills/cliblog"
  INSTALL_TYPE="グローバル"
else
  SKILL_DIR="./.claude/skills/cliblog"
  INSTALL_TYPE="プロジェクト"
fi
SKILL_FILE="$SKILL_DIR/skill.md"
TMP_FILE=""

# Cleanup function
cleanup() {
  [ -n "$TMP_FILE" ] && [ -f "$TMP_FILE" ] && rm -f "$TMP_FILE"
}
trap cleanup EXIT

echo "🚀 CLIBLOG スキルをインストールしています..."
echo "   モード: $INSTALL_TYPE"
if [[ "$INSTALL_TYPE" == "プロジェクト" ]]; then
  echo "   配置先: \$(pwd)/$SKILL_DIR"
else
  echo "   配置先: $SKILL_DIR"
fi
echo ""

# Create skill directory
mkdir -p "$SKILL_DIR"

# Create temp file
TMP_FILE="\$(mktemp)"

# Download skill file to temp
echo "📥 スキルファイルをダウンロード中..."
if ! curl -fsSL "$BASE_URL/skill.md" -o "$TMP_FILE"; then
  echo "❌ ダウンロードに失敗しました"
  exit 1
fi

# Verify download is not empty
if [ ! -s "$TMP_FILE" ]; then
  echo "❌ ダウンロードしたファイルが空です"
  exit 1
fi

# Checksum verification
echo "🔐 チェックサム検証中..."
EXPECTED_SHA256="\$(curl -fsSL "$BASE_URL/skill.md.sha256" 2>/dev/null || echo "")"
if [ -n "$EXPECTED_SHA256" ]; then
  if command -v shasum >/dev/null 2>&1; then
    ACTUAL_SHA256="\$(shasum -a 256 "$TMP_FILE" | cut -d' ' -f1)"
  elif command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_SHA256="\$(sha256sum "$TMP_FILE" | cut -d' ' -f1)"
  else
    echo "⚠️  sha256 コマンドが見つかりません（検証スキップ）"
    ACTUAL_SHA256="$EXPECTED_SHA256"
  fi

  if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
    echo "❌ チェックサムが一致しません"
    echo "   期待値: $EXPECTED_SHA256"
    echo "   実際値: $ACTUAL_SHA256"
    exit 1
  fi
  echo "   ✓ チェックサム OK"
else
  echo "   ⚠️  チェックサムファイルなし（検証スキップ）"
fi

# Backup existing file if present
if [ -f "$SKILL_FILE" ]; then
  BACKUP_FILE="$SKILL_FILE.bak-\$(date +%Y%m%d%H%M%S)"
  echo "📦 既存ファイルをバックアップ: $BACKUP_FILE"
  cp "$SKILL_FILE" "$BACKUP_FILE"
fi

# Atomic move
mv "$TMP_FILE" "$SKILL_FILE"
TMP_FILE=""  # Prevent cleanup from removing the installed file

echo ""
echo "✅ インストール完了！"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Claude Code で以下のように使えます:"
echo ""
echo '  「ブログ始めたい」     → アカウント登録'
echo '  「〇〇について記事書いて」 → 記事投稿'
echo '  「記事の一覧見せて」   → 投稿一覧'
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
`;

/**
 * GET /install-skill.sh - Bash installer script
 */
installRoutes.get('/install-skill.sh', (c) => {
  return c.text(INSTALL_SCRIPT, 200, {
    'Content-Type': 'text/x-shellscript; charset=utf-8',
    'Cache-Control': 'public, max-age=600',
    'X-Content-Type-Options': 'nosniff',
  });
});

/**
 * GET /skill.md - Skill definition file
 */
installRoutes.get('/skill.md', (c) => {
  return c.text(SKILL_CONTENT, 200, {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 'public, max-age=600',
    'X-Content-Type-Options': 'nosniff',
  });
});

/**
 * GET /skill.md.sha256 - SHA-256 checksum of skill.md
 */
installRoutes.get('/skill.md.sha256', async (c) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(SKILL_CONTENT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return c.text(hashHex, 200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=600',
    'X-Content-Type-Options': 'nosniff',
  });
});
