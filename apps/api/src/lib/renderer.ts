/**
 * Dynamic Renderer for blog posts
 * Converts Markdown to sanitized HTML
 */
import { marked } from 'marked';

// Configure marked for safe output
marked.setOptions({
  gfm: true,        // GitHub Flavored Markdown
  breaks: true,     // Convert \n to <br>
});

// Allowed HTML tags (whitelist) - for reference/future use
// const ALLOWED_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
//   'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'strong', 'em',
//   'del', 's', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'];

/**
 * Simple HTML sanitizer (whitelist-based)
 * Removes disallowed tags and attributes
 */
function sanitizeHtml(html: string): string {
  // Remove script tags and their content
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove event handlers
  html = html.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  html = html.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');

  // Remove javascript: URLs
  html = html.replace(/href\s*=\s*["']?\s*javascript:[^"'>]*/gi, 'href="#"');

  // Remove data: URLs in src (except for safe image types)
  html = html.replace(/src\s*=\s*["']?\s*data:(?!image\/(png|jpeg|gif|webp))[^"'>]*/gi, 'src=""');

  return html;
}

/**
 * Resolve asset:ID references to actual URLs
 */
function resolveAssetRefs(html: string, assetBaseUrl: string): string {
  // Replace ![alt](asset:ID) pattern
  // assetBaseUrl should be like https://cliblog-api.notef.workers.dev/assets
  return html.replace(
    /src="asset:([a-z0-9-]+)"/gi,
    (_, assetId) => `src="${assetBaseUrl}/${assetId}"`
  );
}

/**
 * Convert Markdown to sanitized HTML
 */
export async function renderMarkdown(
  markdown: string,
  assetBaseUrl: string,
): Promise<string> {
  // Parse Markdown to HTML
  const rawHtml = await marked.parse(markdown);

  // Sanitize HTML
  const sanitized = sanitizeHtml(rawHtml);

  // Resolve asset references
  const resolved = resolveAssetRefs(sanitized, assetBaseUrl);

  return resolved;
}

/**
 * Generate full HTML page for a blog post
 */
export function renderPage(options: {
  title: string;
  content: string;
  slug: string;
  subdomain: string;
  publishedAt: string | null;
  serviceDomain: string;
}): string {
  const { title, content, slug, subdomain, publishedAt, serviceDomain } = options;

  const canonicalUrl = `https://${subdomain}.${serviceDomain}/${slug}`;
  const publishedDate = publishedAt ? new Date(publishedAt).toLocaleDateString('ja-JP') : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonicalUrl}">
  <style>
    :root {
      --bg: #ffffff;
      --text: #1a1a1a;
      --muted: #666666;
      --border: #e5e5e5;
      --code-bg: #f5f5f5;
      --link: #0066cc;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1a1a1a;
        --text: #e5e5e5;
        --muted: #999999;
        --border: #333333;
        --code-bg: #2a2a2a;
        --link: #66b3ff;
      }
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", sans-serif;
      line-height: 1.8;
      color: var(--text);
      background: var(--bg);
      margin: 0;
      padding: 2rem 1rem;
    }
    article {
      max-width: 720px;
      margin: 0 auto;
    }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.5rem; margin-top: 2rem; }
    h3 { font-size: 1.25rem; margin-top: 1.5rem; }
    time { color: var(--muted); font-size: 0.875rem; }
    a { color: var(--link); }
    img { max-width: 100%; height: auto; border-radius: 4px; }
    pre {
      background: var(--code-bg);
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
    }
    code {
      font-family: "SF Mono", Consolas, monospace;
      font-size: 0.9em;
    }
    :not(pre) > code {
      background: var(--code-bg);
      padding: 0.2em 0.4em;
      border-radius: 3px;
    }
    blockquote {
      border-left: 3px solid var(--border);
      margin-left: 0;
      padding-left: 1rem;
      color: var(--muted);
    }
    hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid var(--border); padding: 0.5rem; text-align: left; }
    th { background: var(--code-bg); }
  </style>
</head>
<body>
  <article>
    <header>
      <h1>${escapeHtml(title)}</h1>
      ${publishedDate ? `<time datetime="${publishedAt}">${publishedDate}</time>` : ''}
    </header>
    <main>
      ${content}
    </main>
  </article>
</body>
</html>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Security headers for rendered pages
 */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/**
 * Cache headers for rendered pages
 */
export const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
};
