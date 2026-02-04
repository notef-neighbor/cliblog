# Changelog

All notable changes to CLIBLOG will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] - 2026-02-04

### Fixed

- **Accept-Language cache handling**: Cloudflare edge cache was ignoring `Vary: Accept-Language` header, causing all users to see the same cached language regardless of browser settings. Now uses Workers Cache API with locale-specific cache keys.

### Changed

- Improved Accept-Language header parsing with proper q-value sorting, wildcard (`*`) skipping, and `q=0` exclusion
- Added `normalizeLocale()` function for consistent locale handling between cache keys and DB queries
- Index page links now always include explicit `?lang=` parameter
- Added `ar` (Arabic) and `hi` (Hindi) to supported locales

### Technical Details

- Cache key now uses `_lang={locale}` or `_lang=auto` for unspecified locale
- Unspecified locale (`auto`) is cached separately from explicit `ja` requests
- `locale === null` is treated as `ja` per DB schema convention

## [1.1.0] - 2026-02-03

### Added

- **Multi-language (i18n) support**: Posts can now be translated into multiple languages
- `locale`, `original_post_id`, `translation_status` columns in posts table
- `default_translation_locales` setting in users table
- `POST /v1/posts` now accepts `locale` and `translate_to` parameters
- `GET /v1/posts/:id/translations` endpoint
- `?lang=` parameter and `Accept-Language` header support for blog pages
- "Translation in progress" page for pending translations
- `canonical` and `hreflang` tags for SEO

### Changed

- Blog URLs now support language switching via `?lang=xx` parameter
- Editing original post marks translations as "needs update"

## [1.0.0] - 2026-02-02

### Added

- Initial release
- REST API for blog posts (CRUD + publish)
- Asset upload (images) to R2
- HMAC + keyId authentication
- Dynamic Markdown rendering
- Subdomain-based blog routing
- Custom domain support (blog.dreamcore.gg)
- Public asset endpoint with caching
