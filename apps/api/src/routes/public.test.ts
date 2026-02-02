import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../index';
import { setupDatabase, cleanDatabase } from '../__tests__/setup';

describe('Public Routes', () => {
  const testUserId = 'test-user-001';
  const testSubdomain = 'testblog';
  const testPostId = 'test-post-001';
  const testSlug = 'hello-world';
  const testContent = '# Hello World\n\nThis is a test post.';

  // Setup test data before tests
  beforeAll(async () => {
    await setupDatabase();
    await cleanDatabase();

    const now = new Date().toISOString();

    // Create test user
    await env.DB.prepare(
      `INSERT INTO users (id, email, subdomain, theme, settings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(testUserId, 'test@example.com', testSubdomain, 'default', '{}', now, now).run();

    // Create test post
    const contentKey = `content/${testUserId}/${testPostId}.md`;
    await env.DB.prepare(
      `INSERT INTO posts (id, user_id, slug, title, content_key, excerpt, status, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(testPostId, testUserId, testSlug, 'Hello World', contentKey, 'Test excerpt', 'published', now, now, now).run();

    // Store content in R2
    await env.CONTENT_BUCKET.put(contentKey, testContent);
  });

  describe('GET /{slug} - View post', () => {
    it('returns 200 with HTML for valid published post', async () => {
      const res = await app.request(`/${testSlug}`, {
        headers: { Host: `${testSubdomain}.cliblog.com` },
      }, env);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');

      const html = await res.text();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<h1>Hello World</h1>');
    });

    it('returns 404 for non-existent slug', async () => {
      const res = await app.request('/non-existent-post', {
        headers: { Host: `${testSubdomain}.cliblog.com` },
      }, env);

      expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent subdomain', async () => {
      const res = await app.request(`/${testSlug}`, {
        headers: { Host: 'nonexistent.cliblog.com' },
      }, env);

      expect(res.status).toBe(404);
    });

    it('includes all required security headers', async () => {
      const res = await app.request(`/${testSlug}`, {
        headers: { Host: `${testSubdomain}.cliblog.com` },
      }, env);

      expect(res.headers.get('Content-Security-Policy')).toContain("script-src 'none'");
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    });

    it('includes cache headers', async () => {
      const res = await app.request(`/${testSlug}`, {
        headers: { Host: `${testSubdomain}.cliblog.com` },
      }, env);

      const cacheControl = res.headers.get('Cache-Control');
      expect(cacheControl).toContain('public');
      expect(cacheControl).toContain('s-maxage=60');
      expect(cacheControl).toContain('stale-while-revalidate');
    });

    it('renders markdown content as HTML', async () => {
      const res = await app.request(`/${testSlug}`, {
        headers: { Host: `${testSubdomain}.cliblog.com` },
      }, env);

      const html = await res.text();
      // Check H1 is rendered (from "# Hello World")
      expect(html).toContain('<h1>Hello World</h1>');
      // Check paragraph is rendered
      expect(html).toContain('<p>This is a test post.</p>');
    });
  });

  describe('GET / - Blog index', () => {
    it('returns 200 with HTML for valid subdomain', async () => {
      const res = await app.request('/', {
        headers: { Host: `${testSubdomain}.cliblog.com` },
      }, env);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');
    });

    it('returns blog title with subdomain', async () => {
      const res = await app.request('/', {
        headers: { Host: `${testSubdomain}.cliblog.com` },
      }, env);

      const html = await res.text();
      expect(html).toContain(`${testSubdomain}`);
    });

    it('lists published posts', async () => {
      const res = await app.request('/', {
        headers: { Host: `${testSubdomain}.cliblog.com` },
      }, env);

      const html = await res.text();
      expect(html).toContain('Hello World');
      expect(html).toContain(`href="/${testSlug}"`);
    });

    it('includes security headers', async () => {
      const res = await app.request('/', {
        headers: { Host: `${testSubdomain}.cliblog.com` },
      }, env);

      expect(res.headers.get('Content-Security-Policy')).toBeDefined();
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('returns 404 for non-existent subdomain', async () => {
      const res = await app.request('/', {
        headers: { Host: 'nobody.cliblog.com' },
      }, env);

      expect(res.status).toBe(404);
    });
  });

  describe('Subdomain Routing', () => {
    it('requires Host header with subdomain', async () => {
      // Without proper subdomain, should return 404 or fall through
      const res = await app.request('/hello-world', {
        headers: { Host: 'cliblog.com' }, // No subdomain
      }, env);

      // Main domain without subdomain should not match public routes
      expect(res.status).toBe(404);
    });

    it('correctly extracts subdomain from host', async () => {
      const res = await app.request('/', {
        headers: { Host: `${testSubdomain}.cliblog.com` },
      }, env);

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(testSubdomain);
    });

    it('isolates users by subdomain', async () => {
      // Request to different subdomain should not see testblog's posts
      const res = await app.request(`/${testSlug}`, {
        headers: { Host: 'otheruser.cliblog.com' },
      }, env);

      expect(res.status).toBe(404);
    });

    it('works with localhost subdomain pattern', async () => {
      const res = await app.request('/', {
        headers: { Host: `${testSubdomain}.localhost` },
      }, env);

      expect(res.status).toBe(200);
    });
  });
});

describe('Draft Posts', () => {
  const draftUserId = 'draft-user-001';
  const draftSubdomain = 'draftblog';
  const draftPostId = 'draft-post-001';

  beforeAll(async () => {
    await setupDatabase();

    const now = new Date().toISOString();

    // Create user for draft test
    await env.DB.prepare(
      `INSERT INTO users (id, email, subdomain, theme, settings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(draftUserId, 'draft@example.com', draftSubdomain, 'default', '{}', now, now).run();

    // Create draft post (not published)
    const contentKey = `content/${draftUserId}/${draftPostId}.md`;
    await env.DB.prepare(
      `INSERT INTO posts (id, user_id, slug, title, content_key, excerpt, status, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(draftPostId, draftUserId, 'draft-post', 'Draft Post', contentKey, '', 'draft', null, now, now).run();

    await env.CONTENT_BUCKET.put(contentKey, '# Draft');
  });

  it('does not show draft posts in index', async () => {
    const res = await app.request('/', {
      headers: { Host: `${draftSubdomain}.cliblog.com` },
    }, env);

    const html = await res.text();
    expect(html).not.toContain('Draft Post');
  });

  it('returns 404 for draft post slug', async () => {
    const res = await app.request('/draft-post', {
      headers: { Host: `${draftSubdomain}.cliblog.com` },
    }, env);

    expect(res.status).toBe(404);
  });
});
