---
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

### i18n (Multi-language) System

CLIBLOG supports multi-language posts with these key principles:

- **Same slug, multiple locales**: All translations share one slug (e.g., `my-post`)
- **Access via ?lang=**: `${blogUrl}/my-post?lang=en`, `${blogUrl}/my-post?lang=zh`
- **Auto-detection**: Readers see content in their browser language automatically
- **Translation API**: Use `POST /v1/posts/:id/translations` to create translations
- **Do NOT** create separate posts with language suffixes (e.g., `my-post-en`, `my-post-zh`)

## Config file

Path: `~/.config/cliblog/config.json`

Example:

```json
{
  "apiUrl": "https://blog.dreamcore.gg",
  "apiKey": "sk_blog_***",
  "subdomain": "your-subdomain",
  "blogUrl": "https://your-blog.example"
}
```

Notes:

- **Never show the API key** in output or logs.
- Always use `blogUrl` from the config. **Do not construct it yourself**.
- For self-hosted instances, `apiUrl` will be different; always read it from the config.

## Setup (registration)

When the user says "I want to start a blog" or "Register me":

0. Set `API_URL`:
   - If config exists, use `config.apiUrl`.
   - If config is missing, use the default instance (`https://blog.dreamcore.gg`) unless the user provided another URL.

1. Check for config:
   ```bash
   cat ~/.config/cliblog/config.json 2>/dev/null
   ```
   If config exists and has valid apiKey, skip registration.

2. If no config, ask for:
   - Subdomain (required; lowercase letters, numbers, hyphen; must start with a letter)
   - Email (optional; not used for login)

   Ask explicitly (to avoid confusion):
   - Japanese: 「サブドメイン（必須）」「メールアドレス（任意・ログインには使いません／空でもOK）」
   - English: "Subdomain (required)" "Email (optional, not used for login, can be skipped)"

3. Call register:
   ```bash
   curl -s -X POST "${API_URL}/v1/auth/register" \
     -H "Content-Type: application/json" \
     -d '{"email":"USER_EMAIL","subdomain":"USER_SUBDOMAIN"}'
   ```
   - If the user skips email, **omit the email field**.

4. Save config with the response values:
   ```bash
   mkdir -p ~/.config/cliblog
   cat > ~/.config/cliblog/config.json << 'EOF'
   {
     "apiUrl": "${API_URL}",
     "apiKey": "RESPONSE.data.attributes.apiKey",
     "subdomain": "RESPONSE.data.attributes.subdomain",
     "blogUrl": "RESPONSE.data.attributes.blogUrl"
   }
   EOF
   ```

5. Reply with the returned `blogUrl` only.

## Create and publish a post

When the user asks to write or publish a post:

1. Read config (do not reveal `apiKey`) and set `API_URL` and `API_KEY`.
2. Generate Markdown content.
3. Create post:
   ```bash
   curl -s -X POST "${API_URL}/v1/posts" \
     -H "Authorization: Bearer ${API_KEY}" \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Post title",
       "slug": "url-friendly-slug",
       "content": "# Heading\n\nBody...",
       "locale": "ja"
     }'
   ```
   - `locale`: Language code of the post (ja, en, zh, ko, fr, de, es). Detect from content.
4. Publish:
   ```bash
   curl -s -X POST "${API_URL}/v1/posts/${POST_ID}/publish" \
     -H "Authorization: Bearer ${API_KEY}"
   ```
5. Reply with URL:
   ```
   ${blogUrl}/${slug}
   ```
6. **Proactively offer translation:**
   - Japanese: 「この記事を英語や他の言語に翻訳して公開しましょうか？」
   - English: "Would you like me to translate this post into other languages?"

## Translation (proactive support)

After publishing a post, offer to translate it. If the user accepts:

**IMPORTANT**: All translations share the SAME slug as the original. Do NOT create separate posts with different slugs (e.g., `-en`, `-zh` suffixes). Use the translation API.

1. Add translation placeholders to the existing post:
   ```bash
   curl -s -X POST "${API_URL}/v1/posts/${POST_ID}/translations" \
     -H "Authorization: Bearer ${API_KEY}" \
     -H "Content-Type: application/json" \
     -d '{ "locales": ["en", "zh"] }'
   ```
   Response includes translation IDs for each locale.

2. For each translation in the response:
   - Generate translated **title and content only** (slug stays the same!)
   - Update the translation:
     ```bash
     curl -s -X PUT "${API_URL}/v1/posts/${TRANSLATION_ID}" \
       -H "Authorization: Bearer ${API_KEY}" \
       -H "Content-Type: application/json" \
       -d '{
         "title": "Translated Title",
         "content": "# Translated content..."
       }'
     ```
   - Do NOT change the slug. All translations share the original slug.
   - Translation is auto-published if original is already published.

3. On success, show the translated URLs (all use same slug with ?lang= parameter):
   ```
   ${blogUrl}/${original-slug}?lang=en
   ${blogUrl}/${original-slug}?lang=zh
   ```

   Note: Readers with matching browser language settings will automatically see the correct version without ?lang= parameter.

4. On failure, mark as failed:
   ```bash
   curl -s -X PUT "${API_URL}/v1/posts/${TRANSLATION_ID}" \
     -H "Authorization: Bearer ${API_KEY}" \
     -H "Content-Type: application/json" \
     -d '{
       "translation_status": "failed",
       "last_translation_error": "Error message"
     }'
   ```
   Then ask user if they want to retry.

5. Display results in a table format:
   ```
   | Language | Title | URL |
   |----------|-------|-----|
   | 🇯🇵 日本語 | 元のタイトル | ${blogUrl}/${slug} |
   | 🇺🇸 English | Translated Title | ${blogUrl}/${slug}?lang=en |
   | 🇨🇳 中文 | 翻译标题 | ${blogUrl}/${slug}?lang=zh |
   ```
   Note: All URLs share the same slug. The `?lang=` parameter is optional—browsers with matching Accept-Language header will see the correct version automatically.

## Editing and re-translation

When the user edits a post:

1. After updating the original, check for pending translations:
   ```bash
   curl -s "${API_URL}/v1/posts/${POST_ID}/translations" \
     -H "Authorization: Bearer ${API_KEY}"
   ```

2. If any translation has `status: "pending"`:
   - Inform user: 「翻訳も更新が必要です。更新しますか？」/ "Translations need updating. Should I update them?"
   - If yes, re-translate each pending translation using the same flow above.

3. To lock a translation from auto-updates (manual edit):
   ```bash
   curl -s -X PUT "${API_URL}/v1/posts/${TRANSLATION_ID}" \
     -H "Authorization: Bearer ${API_KEY}" \
     -H "Content-Type: application/json" \
     -d '{ "translation_locked": true }'
   ```

## Consistency check

Before translating, verify source revision:

1. Get original's `updatedAt` from GET /v1/posts/:id
2. Get translation's `sourceRevision` from GET /v1/posts/:id/translations/:locale
3. If `sourceRevision < updatedAt`, the original was updated after last translation.
   - Warn user and re-translate with latest content.

## Image upload

If the user wants to include an image:

1. Upload asset:
   ```bash
   curl -s -X POST "${API_URL}/v1/assets" \
     -H "Authorization: Bearer ${API_KEY}" \
     -F "file=@/path/to/image.png" \
     -F "type=image"
   ```
2. Use the returned `markdownRef`, e.g.:
   ```markdown
   ![alt text](asset:ASSET_ID)
   ```
3. Include it in the post Markdown, then create/publish as usual.

## List posts

```bash
curl -s "${API_URL}/v1/posts" \
  -H "Authorization: Bearer ${API_KEY}"
```

## Delete a post

```bash
curl -s -X DELETE "${API_URL}/v1/posts/${POST_ID}" \
  -H "Authorization: Bearer ${API_KEY}"
```

## Account deletion

If the user wants to delete their account:

1. Confirm explicitly: require `delete my account`.
2. Call:
   ```bash
   curl -s -X DELETE "${API_URL}/v1/auth/account" \
     -H "Authorization: Bearer ${API_KEY}" \
     -H "Content-Type: application/json" \
     -d '{"confirm":"delete my account"}'
   ```
3. Remove config:
   ```bash
   rm -f ~/.config/cliblog/config.json
   ```
4. Inform the user.

Note: `account:delete` permission is required (initial key includes it).

## API key management (optional)

If the user asks to create/rotate keys:

- Create key (requires `keys:manage`):
  ```bash
  curl -s -X POST "${API_URL}/v1/auth/keys" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"name":"Read Only","permissions":"posts:read,assets:read"}'
  ```
- List keys:
  ```bash
  curl -s "${API_URL}/v1/auth/keys" \
    -H "Authorization: Bearer ${API_KEY}"
  ```
- Revoke key:
  ```bash
  curl -s -X DELETE "${API_URL}/v1/auth/keys/${KEY_ID}" \
    -H "Authorization: Bearer ${API_KEY}"
  ```

Never display key secrets after creation.

## Error handling

- `auth.subdomain_taken`: Subdomain already used.
- `auth.invalid_email`: Invalid email (only when provided).
- `auth.email_taken`: Email already registered (only when provided).
- `auth.invalid_subdomain`: Must be 3–30 lowercase letters, digits, hyphen, start with a letter.
- `auth.insufficient_permissions`: Missing required permission.
- `auth.privilege_escalation`: Attempted permission escalation.
- `auth.invalid_permissions`: Invalid permissions string.
- `posts.not_found`: Post not found.
- `assets.invalid_type`: Only `image` is allowed.

## Security

- Never print `apiKey`.
- Never echo config contents.
- Keep command output minimal.
