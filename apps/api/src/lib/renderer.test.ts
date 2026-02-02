import { describe, it, expect } from 'vitest';
import { renderMarkdown, renderPage, SECURITY_HEADERS, CACHE_HEADERS } from './renderer';

describe('Markdown Rendering', () => {
  const assetBaseUrl = 'https://img.cliblog.com';

  describe('renderMarkdown', () => {
    it('renders headings correctly', async () => {
      const markdown = '# H1\n## H2\n### H3';
      const html = await renderMarkdown(markdown, assetBaseUrl);

      expect(html).toContain('<h1>H1</h1>');
      expect(html).toContain('<h2>H2</h2>');
      expect(html).toContain('<h3>H3</h3>');
    });

    it('renders code blocks correctly', async () => {
      const markdown = '```javascript\nconsole.log("test");\n```';
      const html = await renderMarkdown(markdown, assetBaseUrl);

      expect(html).toContain('<pre>');
      expect(html).toContain('<code');
      expect(html).toContain('console.log');
    });

    it('renders inline code correctly', async () => {
      const markdown = 'Use `const` for constants';
      const html = await renderMarkdown(markdown, assetBaseUrl);

      expect(html).toContain('<code>const</code>');
    });

    it('renders lists correctly', async () => {
      const markdown = '- Item 1\n- Item 2\n- Item 3';
      const html = await renderMarkdown(markdown, assetBaseUrl);

      expect(html).toContain('<ul>');
      expect(html).toContain('<li>Item 1</li>');
      expect(html).toContain('<li>Item 2</li>');
      expect(html).toContain('<li>Item 3</li>');
    });

    it('renders ordered lists correctly', async () => {
      const markdown = '1. First\n2. Second\n3. Third';
      const html = await renderMarkdown(markdown, assetBaseUrl);

      expect(html).toContain('<ol>');
      expect(html).toContain('<li>First</li>');
    });

    it('renders blockquotes correctly', async () => {
      const markdown = '> This is a quote';
      const html = await renderMarkdown(markdown, assetBaseUrl);

      expect(html).toContain('<blockquote>');
      expect(html).toContain('This is a quote');
    });

    it('renders bold and italic correctly', async () => {
      const markdown = '**bold** and *italic*';
      const html = await renderMarkdown(markdown, assetBaseUrl);

      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<em>italic</em>');
    });

    it('renders links correctly', async () => {
      const markdown = '[Example](https://example.com)';
      const html = await renderMarkdown(markdown, assetBaseUrl);

      expect(html).toContain('<a href="https://example.com">Example</a>');
    });

    it('renders images correctly', async () => {
      const markdown = '![Alt text](https://example.com/image.png)';
      const html = await renderMarkdown(markdown, assetBaseUrl);

      expect(html).toContain('<img');
      expect(html).toContain('src="https://example.com/image.png"');
      expect(html).toContain('alt="Alt text"');
    });

    it('resolves asset:ID references', async () => {
      const markdown = '![Image](asset:abc123)';
      const html = await renderMarkdown(markdown, assetBaseUrl);

      expect(html).toContain(`src="${assetBaseUrl}/abc123"`);
      expect(html).not.toContain('asset:abc123');
    });

    it('renders tables correctly', async () => {
      const markdown = '| A | B |\n|---|---|\n| 1 | 2 |';
      const html = await renderMarkdown(markdown, assetBaseUrl);

      expect(html).toContain('<table>');
      expect(html).toContain('<th>');
      expect(html).toContain('<td>');
    });
  });

  describe('HTML Sanitization', () => {
    it('removes script tags', async () => {
      const markdown = 'Text <script>alert("xss")</script> More';
      const html = await renderMarkdown(markdown, assetBaseUrl);

      expect(html).not.toContain('<script>');
      expect(html).not.toContain('alert');
    });

    it('removes event handlers', async () => {
      const markdown = '<img src="x" onerror="alert(1)">';
      const html = await renderMarkdown(markdown, assetBaseUrl);

      expect(html).not.toContain('onerror');
    });

    it('removes javascript: URLs', async () => {
      const markdown = '[Click](javascript:alert(1))';
      const html = await renderMarkdown(markdown, assetBaseUrl);

      expect(html).not.toContain('javascript:');
    });
  });

  describe('renderPage', () => {
    it('generates valid HTML document', () => {
      const html = renderPage({
        title: 'Test Post',
        content: '<p>Hello</p>',
        slug: 'test-post',
        subdomain: 'testuser',
        publishedAt: '2026-01-01T00:00:00Z',
        serviceDomain: 'cliblog.com',
      });

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="ja">');
      expect(html).toContain('<title>Test Post</title>');
      expect(html).toContain('<p>Hello</p>');
    });

    it('includes canonical URL', () => {
      const html = renderPage({
        title: 'Test',
        content: '',
        slug: 'my-post',
        subdomain: 'user1',
        publishedAt: null,
        serviceDomain: 'cliblog.com',
      });

      expect(html).toContain('href="https://user1.cliblog.com/my-post"');
    });

    it('includes OG meta tags', () => {
      const html = renderPage({
        title: 'OG Test',
        content: '',
        slug: 'og-test',
        subdomain: 'test',
        publishedAt: null,
        serviceDomain: 'cliblog.com',
      });

      expect(html).toContain('property="og:title"');
      expect(html).toContain('content="OG Test"');
      expect(html).toContain('property="og:type"');
    });

    it('escapes HTML in title', () => {
      const html = renderPage({
        title: '<script>XSS</script>',
        content: '',
        slug: 'xss',
        subdomain: 'test',
        publishedAt: null,
        serviceDomain: 'cliblog.com',
      });

      expect(html).not.toContain('<script>XSS</script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('includes published date when available', () => {
      const html = renderPage({
        title: 'Test',
        content: '',
        slug: 'test',
        subdomain: 'test',
        publishedAt: '2026-01-15T12:00:00Z',
        serviceDomain: 'cliblog.com',
      });

      expect(html).toContain('<time');
      expect(html).toContain('datetime="2026-01-15T12:00:00Z"');
    });
  });

  describe('Security Headers', () => {
    it('has Content-Security-Policy', () => {
      expect(SECURITY_HEADERS['Content-Security-Policy']).toBeDefined();
      expect(SECURITY_HEADERS['Content-Security-Policy']).toContain("script-src 'none'");
    });

    it('has X-Content-Type-Options', () => {
      expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
    });

    it('has X-Frame-Options', () => {
      expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    });

    it('has Referrer-Policy', () => {
      expect(SECURITY_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    });
  });

  describe('Cache Headers', () => {
    it('has Cache-Control with proper directives', () => {
      expect(CACHE_HEADERS['Cache-Control']).toContain('public');
      expect(CACHE_HEADERS['Cache-Control']).toContain('s-maxage=60');
      expect(CACHE_HEADERS['Cache-Control']).toContain('stale-while-revalidate');
    });
  });
});
