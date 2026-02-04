# Changelog

All notable changes to CLIBLOG will be documented in this file.

Versioning follows [CalVer](https://calver.org/) format: `YYYY.M.D` (e.g., 2026.2.4).
Multiple releases on the same day use suffix: `YYYY.M.D-N` (e.g., 2026.2.4-1).

## 2026.2.4

### Fixes

- Accept-Language cache handling: Cloudflare edge cache was ignoring `Vary: Accept-Language` header, causing all users to see the same cached language regardless of browser settings. Now uses Workers Cache API with locale-specific cache keys.

### Changes

- Improved Accept-Language header parsing with proper q-value sorting, wildcard (`*`) skipping, and `q=0` exclusion.
- Added `normalizeLocale()` function for consistent locale handling between cache keys and DB queries.
- Index page links now always include explicit `?lang=` parameter.
- Added `ar` (Arabic) and `hi` (Hindi) to supported locales.
- Cache key uses `_lang=auto` sentinel for unspecified locale (separates from explicit `ja`).

## 2026.2.3

### Changes

- Multi-language (i18n) support: Posts can now be translated into multiple languages.
- Added `locale`, `original_post_id`, `translation_status` columns in posts table.
- Added `default_translation_locales` setting in users table.
- `POST /v1/posts` now accepts `locale` and `translate_to` parameters.
- Added `GET /v1/posts/:id/translations` endpoint.
- Added `?lang=` parameter and `Accept-Language` header support for blog pages.
- Added "Translation in progress" page for pending translations.
- Added `canonical` and `hreflang` tags for SEO.
- Editing original post marks translations as "needs update".

## 2026.2.2

### Changes

- Initial public release.
- REST API for blog posts (CRUD + publish).
- Asset upload (images) to R2.
- HMAC + keyId authentication.
- Dynamic Markdown rendering.
- Subdomain-based blog routing.
- Custom domain support.
- Public asset endpoint with caching.
