/**
 * Public routes for blog viewing
 * Handles subdomain-based routing: {user}.cliblog.com/{slug}
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

export const publicRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /{slug} - View a published blog post
 */
publicRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const host = c.req.header('Host') || '';
  const serviceDomain = c.env.SERVICE_DOMAIN || 'cliblog.com';

  // Extract subdomain from host
  // e.g., "testuser.cliblog.com" -> "testuser"
  const subdomain = extractSubdomain(host, serviceDomain);

  if (!subdomain) {
    return c.text('Not Found', 404);
  }

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
  // Build asset URL base from request
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

  // Return with security and cache headers
  return c.html(html, 200, {
    ...SECURITY_HEADERS,
    ...CACHE_HEADERS,
  });
});

/**
 * GET / - Blog index page
 */
publicRoutes.get('/', async (c) => {
  const host = c.req.header('Host') || '';
  const serviceDomain = c.env.SERVICE_DOMAIN || 'cliblog.com';
  const subdomain = extractSubdomain(host, serviceDomain);

  if (!subdomain) {
    // Main domain - show landing page or redirect
    return c.text('Welcome to CLIBLOG', 200);
  }

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
    .orderBy(posts.publishedAt);

  // Generate index page
  const html = generateIndexPage(subdomain, publishedPosts, serviceDomain);

  return c.html(html, 200, {
    ...SECURITY_HEADERS,
    ...CACHE_HEADERS,
  });
});

/**
 * Extract subdomain from host
 */
function extractSubdomain(host: string, serviceDomain: string): string | null {
  // Remove port if present
  const hostWithoutPort = host.split(':')[0];

  // Check if it's a subdomain of serviceDomain
  if (hostWithoutPort.endsWith(`.${serviceDomain}`)) {
    return hostWithoutPort.slice(0, -(serviceDomain.length + 1));
  }

  // Local development: check for subdomain.localhost pattern
  if (hostWithoutPort.endsWith('.localhost')) {
    return hostWithoutPort.slice(0, -'.localhost'.length);
  }

  return null;
}

/**
 * Generate blog index page HTML
 */
function generateIndexPage(
  subdomain: string,
  posts: { slug: string; title: string; excerpt: string | null; publishedAt: string | null }[],
  serviceDomain: string,
): string {
  const postsList = posts.map(p => {
    const date = p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('ja-JP') : '';
    return `
      <article>
        <h2><a href="/${p.slug}">${escapeHtml(p.title)}</a></h2>
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
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(subdomain)}'s Blog</h1>
    ${posts.length === 0 ? '<p>No posts yet.</p>' : postsList}
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
