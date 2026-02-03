/**
 * Public blog routes (production)
 * Allows access via: /b/{subdomain}/{slug}
 * Shows only published posts, no preview notice
 */
import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { users, posts } from '@cliblog/db/schema';
import type { Env } from '../lib/types';
import { createDb } from '../lib/db';
import {
  renderMarkdown,
  SECURITY_HEADERS,
  CACHE_HEADERS,
} from '../lib/renderer';

// Locale mapping for date formatting
const DATE_LOCALE_MAP: Record<string, string> = {
  ja: 'ja-JP', en: 'en-US', zh: 'zh-CN', ko: 'ko-KR',
  fr: 'fr-FR', de: 'de-DE', es: 'es-ES', pt: 'pt-BR',
  it: 'it-IT', ru: 'ru-RU', ar: 'ar-SA', hi: 'hi-IN',
};

export const blogRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /b/{subdomain}/{slug} - View a published blog post
 * Supports ?lang= parameter and Accept-Language header for i18n
 */
blogRoutes.get('/:subdomain/:slug', async (c) => {
  const subdomain = c.req.param('subdomain');
  const slug = c.req.param('slug');
  const langParam = c.req.query('lang');

  const db = createDb(c.env.DB);

  // Find user by subdomain
  const user = await db
    .select()
    .from(users)
    .where(eq(users.subdomain, subdomain))
    .get();

  if (!user) {
    return c.text('Blog not found', 404);
  }

  // Determine requested locale: ?lang= > Accept-Language > null
  let requestedLocale: string | null = null;

  if (langParam) {
    requestedLocale = langParam;
  } else {
    // Parse Accept-Language header
    const acceptLanguage = c.req.header('Accept-Language');
    if (acceptLanguage) {
      const preferredLocale = parseAcceptLanguage(acceptLanguage);
      if (preferredLocale) {
        requestedLocale = preferredLocale;
      }
    }
  }

  // Step 1: If locale is specified, try to find post by (slug, locale)
  let post: typeof posts.$inferSelect | null = null;
  let showPendingPage = false;

  if (requestedLocale) {
    const foundPost = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.userId, user.id),
          eq(posts.slug, slug),
          eq(posts.locale, requestedLocale),
          eq(posts.status, 'published'),
        ),
      )
      .get();

    if (foundPost) {
      // Check translation status - if pending/failed, show pending page
      if (foundPost.translationStatus === 'pending' || foundPost.translationStatus === 'failed') {
        showPendingPage = true;
        // We'll handle this below after finding the original
      } else if (foundPost.translationStatus === 'ready' && foundPost.contentKey) {
        post = foundPost;
      }
      // If ready but no contentKey, fall through to fallback
    }
  }

  // Step 2: Fallback - find original post by slug (originalPostId IS NULL preferred)
  if (!post && !showPendingPage) {
    // First try to find original post
    post = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.userId, user.id),
          eq(posts.slug, slug),
          eq(posts.status, 'published'),
        ),
      )
      .orderBy(posts.originalPostId) // NULL comes first in SQLite
      .get() ?? null;
  }

  // If we should show pending page, find the original to link to
  if (showPendingPage) {
    // Find original post for this slug or by originalPostId
    const anyPost = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.userId, user.id),
          eq(posts.slug, slug),
        ),
      )
      .get();

    const originalPostId = anyPost?.originalPostId || anyPost?.id;
    if (originalPostId) {
      const originalPost = await db
        .select()
        .from(posts)
        .where(eq(posts.id, originalPostId))
        .get();

      const originalLocale = originalPost?.locale || 'ja';
      const localeName = getLocaleName(originalLocale);

      return c.html(renderPendingTranslationPage({
        subdomain,
        slug,
        requestedLocale: requestedLocale || '',
        originalLocale,
        originalLocaleName: localeName,
      }), 200, {
        ...SECURITY_HEADERS,
        'Cache-Control': 'no-cache',
        'Vary': 'Accept-Language',
      });
    }
  }

  if (!post) {
    return c.text('Post not found', 404);
  }

  // Determine the original post ID
  const originalPostId = post.originalPostId || post.id;

  // If we found a post but locale was requested and differs, try to find translation
  if (requestedLocale && post.locale !== requestedLocale) {
    // Try to find a translation in the requested locale
    const translation = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.userId, user.id),
          eq(posts.originalPostId, originalPostId),
          eq(posts.locale, requestedLocale),
        ),
      )
      .get();

    // P1 fix: Also check status='published' to prevent draft translations from being shown
    if (translation && translation.status === 'published' && translation.translationStatus === 'ready' && translation.contentKey) {
      post = translation;
    } else if (translation && (translation.translationStatus === 'pending' || translation.translationStatus === 'failed')) {
      // P2 fix: Show pending page for both pending and failed translations
      const originalPost = await db
        .select()
        .from(posts)
        .where(eq(posts.id, originalPostId))
        .get();

      const originalLocale = originalPost?.locale || 'ja';
      const localeName = getLocaleName(originalLocale);

      return c.html(renderPendingTranslationPage({
        subdomain,
        slug,
        requestedLocale,
        originalLocale,
        originalLocaleName: localeName,
      }), 200, {
        ...SECURITY_HEADERS,
        'Cache-Control': 'no-cache',
        'Vary': 'Accept-Language',
      });
    }
    // If no translation found, fall through to show original/found post
  }

  if (!post.contentKey || !post.title || !post.slug) {
    return c.text('Post not found', 404);
  }

  // Get content from R2
  const contentObj = await c.env.CONTENT_BUCKET.get(post.contentKey);
  if (!contentObj) {
    return c.text('Content not found', 404);
  }

  const markdown = await contentObj.text();

  // Render Markdown to HTML
  const reqUrl = new URL(c.req.url);
  const assetBaseUrl = `${reqUrl.protocol}//${reqUrl.host}/assets`;
  const htmlContent = await renderMarkdown(markdown, assetBaseUrl);

  // Fetch all translations for hreflang tags
  const allVersions = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      locale: posts.locale,
      originalPostId: posts.originalPostId,
      translationStatus: posts.translationStatus,
    })
    .from(posts)
    .where(
      and(
        eq(posts.userId, user.id),
        eq(posts.status, 'published'),
      ),
    );

  // Get original post and its translations
  const originalPost = allVersions.find(p => p.id === originalPostId);
  const translations = allVersions.filter(
    p => p.originalPostId === originalPostId &&
         p.translationStatus === 'ready' &&
         p.slug !== null
  );

  // Build hreflang data
  const hreflangData: { locale: string; slug: string }[] = [];
  if (originalPost?.slug) {
    hreflangData.push({
      locale: originalPost.locale || 'ja',
      slug: originalPost.slug,
    });
  }
  for (const t of translations) {
    if (t.slug && t.locale) {
      hreflangData.push({
        locale: t.locale,
        slug: t.slug,
      });
    }
  }

  // Generate full page (no preview mode)
  const html = renderBlogPage({
    title: post.title,
    content: htmlContent,
    slug: post.slug,
    subdomain,
    publishedAt: post.publishedAt,
    currentLocale: post.locale || 'ja',
    hreflangData,
    baseUrl: `${reqUrl.protocol}//${reqUrl.host}`,
  });

  // Set cache headers based on whether locale was explicitly requested
  const headers = langParam
    ? { ...SECURITY_HEADERS, ...CACHE_HEADERS }
    : { ...SECURITY_HEADERS, ...CACHE_HEADERS, 'Vary': 'Accept-Language' };

  return c.html(html, 200, headers);
});

/**
 * GET /b/{subdomain} - Blog index page
 */
blogRoutes.get('/:subdomain', async (c) => {
  const subdomain = c.req.param('subdomain');
  const langParam = c.req.query('lang');

  const db = createDb(c.env.DB);

  // Find user by subdomain
  const user = await db
    .select()
    .from(users)
    .where(eq(users.subdomain, subdomain))
    .get();

  if (!user) {
    return c.text('Blog not found', 404);
  }

  // Determine requested locale: ?lang= > Accept-Language > null
  let requestedLocale: string | null = null;
  if (langParam) {
    requestedLocale = langParam;
  } else {
    const acceptLanguage = c.req.header('Accept-Language');
    if (acceptLanguage) {
      requestedLocale = parseAcceptLanguage(acceptLanguage);
    }
  }

  // Get all published posts (including translations)
  const allPostsWithOriginal = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      locale: posts.locale,
      publishedAt: posts.publishedAt,
      originalPostId: posts.originalPostId,
      translationStatus: posts.translationStatus,
    })
    .from(posts)
    .where(
      and(
        eq(posts.userId, user.id),
        eq(posts.status, 'published'),
      ),
    )
    .orderBy(desc(posts.publishedAt));

  // Separate originals and translations
  const originals = allPostsWithOriginal.filter(p => p.originalPostId === null);
  const translations = allPostsWithOriginal.filter(p => p.originalPostId !== null && p.translationStatus === 'ready');

  // Build display list with localized titles
  const displayPosts: { slug: string; title: string; excerpt: string | null; publishedAt: string | null; locale: string }[] = [];

  for (const original of originals) {
    if (!original.slug || !original.title) continue;

    const originalLocale = original.locale ?? 'ja';

    // If requested locale matches original, use original
    if (!requestedLocale || requestedLocale === originalLocale) {
      displayPosts.push({
        slug: original.slug,
        title: original.title,
        excerpt: original.excerpt,
        publishedAt: original.publishedAt,
        locale: originalLocale,
      });
    } else {
      // Look for translation in requested locale
      const translation = translations.find(
        t => t.originalPostId === original.id && t.locale === requestedLocale
      );

      if (translation && translation.slug && translation.title) {
        displayPosts.push({
          slug: translation.slug,
          title: translation.title,
          excerpt: translation.excerpt,
          publishedAt: original.publishedAt, // Use original's publish date for ordering
          locale: requestedLocale,
        });
      } else {
        // Fall back to original
        displayPosts.push({
          slug: original.slug,
          title: original.title,
          excerpt: original.excerpt,
          publishedAt: original.publishedAt,
          locale: originalLocale,
        });
      }
    }
  }

  // Generate index page
  const html = generateBlogIndexPage(subdomain, displayPosts, requestedLocale);

  // Set Vary header if locale was auto-detected
  const headers = langParam
    ? { ...SECURITY_HEADERS, ...CACHE_HEADERS }
    : { ...SECURITY_HEADERS, ...CACHE_HEADERS, 'Vary': 'Accept-Language' };

  return c.html(html, 200, headers);
});

function renderBlogPage(options: {
  title: string;
  content: string;
  slug: string;
  subdomain: string;
  publishedAt: string | null;
  currentLocale?: string;
  hreflangData?: { locale: string; slug: string }[];
  baseUrl?: string;
}): string {
  const { title, content, subdomain, publishedAt, slug, currentLocale = 'ja', hreflangData = [], baseUrl = '' } = options;
  const dateLocale = DATE_LOCALE_MAP[currentLocale] || 'en-US';
  const date = publishedAt ? new Date(publishedAt).toLocaleDateString(dateLocale) : '';

  // Generate hreflang tags
  const hreflangTags = hreflangData.length > 0
    ? hreflangData.map(h =>
        `  <link rel="alternate" hreflang="${h.locale}" href="${baseUrl}/b/${subdomain}/${h.slug}?lang=${h.locale}">`
      ).join('\n') + `\n  <link rel="alternate" hreflang="x-default" href="${baseUrl}/b/${subdomain}/${slug}">`
    : '';

  const canonicalUrl = `${baseUrl}/b/${subdomain}/${slug}?lang=${currentLocale}`;

  return `<!DOCTYPE html>
<html lang="${currentLocale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${escapeHtml(subdomain)}</title>
  <link rel="canonical" href="${canonicalUrl}">
${hreflangTags}
  <style>
    :root {
      --bg: #ffffff;
      --text: #1a1a1a;
      --muted: #666666;
      --link: #0066cc;
      --code-bg: #f5f5f5;
      --border: #e5e5e5;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1a1a1a;
        --text: #e5e5e5;
        --muted: #999999;
        --link: #66b3ff;
        --code-bg: #2d2d2d;
        --border: #404040;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", sans-serif;
      line-height: 1.8;
      color: var(--text);
      background: var(--bg);
      margin: 0;
      padding: 2rem 1rem;
    }
    main { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .meta { color: var(--muted); margin-bottom: 2rem; font-size: 0.875rem; }
    .meta a { color: var(--link); text-decoration: none; }
    .meta a:hover { text-decoration: underline; }
    article img { max-width: 100%; height: auto; }
    article pre { background: var(--code-bg); padding: 1rem; overflow-x: auto; border-radius: 4px; }
    article code { background: var(--code-bg); padding: 0.2em 0.4em; border-radius: 3px; }
    article pre code { background: none; padding: 0; }
    article blockquote { border-left: 4px solid var(--border); margin-left: 0; padding-left: 1rem; color: var(--muted); }
    article a { color: var(--link); }
    article table { border-collapse: collapse; width: 100%; }
    article th, article td { border: 1px solid var(--border); padding: 0.5rem; text-align: left; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <p class="meta">
        ${date ? `<time datetime="${publishedAt}">${date}</time> · ` : ''}
        <a href="/b/${escapeHtml(subdomain)}">${escapeHtml(subdomain)}'s Blog</a>
      </p>
    </header>
    <article>
      ${content}
    </article>
  </main>
</body>
</html>`;
}

function generateBlogIndexPage(
  subdomain: string,
  postList: { slug: string; title: string; excerpt: string | null; publishedAt: string | null; locale?: string }[],
  requestedLocale?: string | null,
): string {
  const pageLocale = requestedLocale || 'ja';
  const postsHtml = postList.map(p => {
    const date = p.publishedAt ? new Date(p.publishedAt).toLocaleDateString(DATE_LOCALE_MAP[pageLocale] || 'en-US') : '';
    const postLocale = p.locale || 'ja';
    const langParam = postLocale !== 'ja' ? `?lang=${postLocale}` : '';
    return `
      <article>
        <h2><a href="/b/${subdomain}/${p.slug}${langParam}">${escapeHtml(p.title)}</a></h2>
        ${p.excerpt ? `<p>${escapeHtml(p.excerpt)}</p>` : ''}
        ${date ? `<time datetime="${p.publishedAt}">${date}</time>` : ''}
      </article>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="${pageLocale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subdomain)}'s Blog</title>
  <style>
    :root {
      --bg: #ffffff;
      --text: #1a1a1a;
      --muted: #666666;
      --link: #0066cc;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1a1a1a;
        --text: #e5e5e5;
        --muted: #999999;
        --link: #66b3ff;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", sans-serif;
      line-height: 1.8;
      color: var(--text);
      background: var(--bg);
      margin: 0;
      padding: 2rem 1rem;
    }
    main { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 2rem; margin-bottom: 2rem; }
    article { margin-bottom: 2rem; }
    article h2 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    article h2 a { color: var(--link); text-decoration: none; }
    article h2 a:hover { text-decoration: underline; }
    article p { margin: 0.5rem 0; color: var(--muted); }
    time { color: var(--muted); font-size: 0.875rem; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(subdomain)}'s Blog</h1>
    ${postList.length === 0 ? '<p>No posts yet.</p>' : postsHtml}
  </main>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parse Accept-Language header and return best matching locale
 * Simple implementation: returns first language code
 */
function parseAcceptLanguage(header: string): string | null {
  const locales = header.split(',').map(part => {
    const [lang] = part.trim().split(';');
    return lang.split('-')[0].toLowerCase(); // 'en-US' -> 'en'
  });
  return locales[0] || null;
}

/**
 * Get human-readable locale name
 */
function getLocaleName(locale: string): string {
  const names: Record<string, string> = {
    ja: 'Japanese',
    en: 'English',
    zh: 'Chinese',
    ko: 'Korean',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
  };
  return names[locale] || locale;
}

/**
 * Render pending translation page
 */
function renderPendingTranslationPage(options: {
  subdomain: string;
  slug: string;
  requestedLocale: string;
  originalLocale: string;
  originalLocaleName: string;
}): string {
  const { subdomain, slug, originalLocale, originalLocaleName } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>Translation in Progress</title>
  <style>
    :root {
      --bg: #ffffff;
      --text: #1a1a1a;
      --muted: #666666;
      --link: #0066cc;
      --border: #e5e5e5;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1a1a1a;
        --text: #e5e5e5;
        --muted: #999999;
        --link: #66b3ff;
        --border: #404040;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", sans-serif;
      line-height: 1.8;
      color: var(--text);
      background: var(--bg);
      margin: 0;
      padding: 2rem 1rem;
    }
    main {
      max-width: 720px;
      margin: 0 auto;
      text-align: center;
      padding: 4rem 1rem;
    }
    .pending-box {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 2rem;
      background: var(--bg);
    }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; }
    p { color: var(--muted); margin: 0.5rem 0; }
    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <main>
    <div class="pending-box">
      <h1>Translation in Progress</h1>
      <p>This article is being translated. Please wait a moment.</p>
      <p><a href="/b/${escapeHtml(subdomain)}/${escapeHtml(slug)}?lang=${originalLocale}">Read in ${originalLocaleName} (original)</a></p>
    </div>
  </main>
</body>
</html>`;
}
