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
  renderPage,
  SECURITY_HEADERS,
  CACHE_HEADERS,
} from '../lib/renderer';

export const blogRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /b/{subdomain}/{slug} - View a published blog post
 */
blogRoutes.get('/:subdomain/:slug', async (c) => {
  const subdomain = c.req.param('subdomain');
  const slug = c.req.param('slug');

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

  // Find published post by slug
  const post = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.userId, user.id),
        eq(posts.slug, slug),
        eq(posts.status, 'published'),
      ),
    )
    .get();

  if (!post) {
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

  // Generate full page (no preview mode)
  const html = renderBlogPage({
    title: post.title,
    content: htmlContent,
    slug: post.slug,
    subdomain,
    publishedAt: post.publishedAt,
  });

  return c.html(html, 200, {
    ...SECURITY_HEADERS,
    ...CACHE_HEADERS,
  });
});

/**
 * GET /b/{subdomain} - Blog index page
 */
blogRoutes.get('/:subdomain', async (c) => {
  const subdomain = c.req.param('subdomain');

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

  // Get published posts (newest first)
  const publishedPosts = await db
    .select({
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      publishedAt: posts.publishedAt,
    })
    .from(posts)
    .where(
      and(
        eq(posts.userId, user.id),
        eq(posts.status, 'published'),
      ),
    )
    .orderBy(desc(posts.publishedAt));

  // Generate index page
  const html = generateBlogIndexPage(subdomain, publishedPosts);

  return c.html(html, 200, {
    ...SECURITY_HEADERS,
    ...CACHE_HEADERS,
  });
});

function renderBlogPage(options: {
  title: string;
  content: string;
  slug: string;
  subdomain: string;
  publishedAt: string | null;
}): string {
  const { title, content, slug, subdomain, publishedAt } = options;
  const date = publishedAt ? new Date(publishedAt).toLocaleDateString('ja-JP') : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${escapeHtml(subdomain)}</title>
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
  postList: { slug: string; title: string; excerpt: string | null; publishedAt: string | null }[],
): string {
  const postsHtml = postList.map(p => {
    const date = p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('ja-JP') : '';
    return `
      <article>
        <h2><a href="/b/${subdomain}/${p.slug}">${escapeHtml(p.title)}</a></h2>
        ${p.excerpt ? `<p>${escapeHtml(p.excerpt)}</p>` : ''}
        ${date ? `<time datetime="${p.publishedAt}">${date}</time>` : ''}
      </article>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
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
