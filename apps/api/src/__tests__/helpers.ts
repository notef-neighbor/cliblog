/**
 * Test helpers and mocks for vitest
 */
import type { Env } from '../lib/types';

// In-memory storage for mocks
const mockDb: Map<string, unknown[]> = new Map();
const mockR2: Map<string, { body: string; metadata?: Record<string, string> }> = new Map();

/**
 * Reset all mock data
 */
export function resetMocks() {
  mockDb.clear();
  mockR2.clear();
}

/**
 * Seed test user
 */
export function seedTestUser(id: string, email: string, subdomain: string) {
  const users = mockDb.get('users') || [];
  users.push({
    id,
    email,
    subdomain,
    theme: 'default',
    settings: '{}',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  mockDb.set('users', users);
}

/**
 * Seed test post
 */
export function seedTestPost(
  id: string,
  userId: string,
  slug: string,
  title: string,
  content: string,
  status: 'draft' | 'published' = 'published',
) {
  const posts = mockDb.get('posts') || [];
  const contentKey = `content/${userId}/${id}.md`;

  posts.push({
    id,
    user_id: userId,
    slug,
    title,
    content_key: contentKey,
    excerpt: content.slice(0, 100),
    tags: '[]',
    status,
    published_at: status === 'published' ? new Date().toISOString() : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  mockDb.set('posts', posts);

  // Store content in mock R2
  mockR2.set(contentKey, { body: content });
}

/**
 * Create mock D1 database
 */
function createMockD1() {
  return {
    prepare: (sql: string) => ({
      bind: (..._params: unknown[]) => ({
        all: async () => {
          // Parse simple SELECT queries
          const match = sql.match(/FROM\s+(\w+)/i);
          const table = match?.[1];
          if (!table) return { results: [] };

          const data = mockDb.get(table) || [];

          // Handle WHERE clauses
          const whereMatch = sql.match(/WHERE\s+(.+?)(?:ORDER|LIMIT|$)/i);
          if (whereMatch) {
            // Simple filtering (this is a simplified mock)
            return { results: data };
          }

          return { results: data };
        },
        first: async () => {
          const match = sql.match(/FROM\s+(\w+)/i);
          const table = match?.[1];
          if (!table) return null;

          const data = mockDb.get(table) || [];
          return data[0] || null;
        },
        run: async () => ({ success: true }),
      }),
    }),
    exec: async () => ({ success: true }),
    batch: async () => [],
    dump: async () => new ArrayBuffer(0),
  };
}

/**
 * Create mock R2 bucket
 */
function createMockR2() {
  return {
    get: async (key: string) => {
      const obj = mockR2.get(key);
      if (!obj) return null;
      return {
        text: async () => obj.body,
        json: async () => JSON.parse(obj.body),
        body: obj.body,
        httpMetadata: obj.metadata,
      };
    },
    put: async (key: string, body: string | ReadableStream, options?: { httpMetadata?: Record<string, string> }) => {
      const content = typeof body === 'string' ? body : 'stream-content';
      mockR2.set(key, { body: content, metadata: options?.httpMetadata });
    },
    delete: async (key: string) => {
      mockR2.delete(key);
    },
    list: async () => ({ objects: [], truncated: false }),
    head: async (key: string) => mockR2.has(key) ? {} : null,
  };
}

/**
 * Create mock environment bindings
 */
export function createMockEnv(): Env {
  return {
    DB: createMockD1() as unknown as Env['DB'],
    CONTENT_BUCKET: createMockR2() as unknown as Env['CONTENT_BUCKET'],
    ASSETS_BUCKET: createMockR2() as unknown as Env['ASSETS_BUCKET'],
    INTERNAL_KEY: 'test_internal_key',
    API_KEY_SECRET: 'test_api_key_secret',
    SERVICE_DOMAIN: 'cliblog.com',
    ENVIRONMENT: 'development',
  };
}

/**
 * Get mock data for inspection
 */
export function getMockDb() {
  return mockDb;
}

export function getMockR2() {
  return mockR2;
}
