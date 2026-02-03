/**
 * Preview routes for blog viewing without custom domain
 * Allows access via: /preview/{subdomain}/{slug}
 */
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { users, posts } from '@cliblog/db/schema';
import type { Env } from '../lib/types';
import { createDb } from '../lib/db';
import {
  renderMarkdown,
  renderPage,
  SECURITY_HEADERS,
  CACHE_HEADERS,
} from '../lib/renderer';

export const previewRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /preview/{subdomain}/{slug} - Preview a published blog post
 */
previewRoutes.get('/:subdomain/:slug', async (c) => {
  const subdomain = c.req.param('subdomain');
  const slug = c.req.param('slug');
  const serviceDomain = c.env.SERVICE_DOMAIN || 'cliblog.com';

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

  if (!post || !post.contentKey || !post.title || !post.slug) {
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

  // Generate full page
  const html = renderPage({
    title: post.title,
    content: htmlContent,
    slug: post.slug,
    subdomain,
    publishedAt: post.publishedAt,
    serviceDomain,
  });

  return c.html(html, 200, {
    ...SECURITY_HEADERS,
    ...CACHE_HEADERS,
  });
});

/**
 * GET /preview/{subdomain} - Blog index page
 */
previewRoutes.get('/:subdomain', async (c) => {
  const subdomain = c.req.param('subdomain');
  const serviceDomain = c.env.SERVICE_DOMAIN || 'cliblog.com';

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

  // Get published posts
  const allPosts = await db
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
    .orderBy(posts.publishedAt);

  // Filter out posts with null slug or title (pending translations)
  const publishedPosts = allPosts.filter(
    (p): p is { slug: string; title: string; excerpt: string | null; publishedAt: string | null } =>
      p.slug !== null && p.title !== null
  );

  // Generate index page
  const html = generateIndexPage(subdomain, publishedPosts, serviceDomain);

  return c.html(html, 200, {
    ...SECURITY_HEADERS,
    ...CACHE_HEADERS,
  });
});

function generateIndexPage(
  subdomain: string,
  postList: { slug: string; title: string; excerpt: string | null; publishedAt: string | null }[],
  serviceDomain: string,
): string {
  const postsHtml = postList.map(p => {
    const date = p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('ja-JP') : '';
    return `
      <article>
        <h2><a href="/preview/${subdomain}/${p.slug}">${escapeHtml(p.title)}</a></h2>
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
  <title>${escapeHtml(subdomain)} - Blog</title>
  <link rel="canonical" href="https://${subdomain}.${serviceDomain}/">
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
    .preview-notice {
      background: #fff3cd;
      color: #856404;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }
    @media (prefers-color-scheme: dark) {
      .preview-notice { background: #3d3200; color: #ffc107; }
    }
  </style>
</head>
<body>
  <main>
    <div class="preview-notice">Preview Mode - 正式な URL: https://${subdomain}.${serviceDomain}/</div>
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
