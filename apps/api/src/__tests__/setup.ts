/**
 * Global test setup for D1 database schema
 */
import { env } from 'cloudflare:test';

/**
 * Create database schema for tests
 */
export async function setupDatabase() {
  // Create users table
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT UNIQUE,
      subdomain TEXT NOT NULL UNIQUE,
      theme TEXT DEFAULT 'default',
      settings TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  // Create api_keys table
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key_id TEXT NOT NULL UNIQUE,
      signature TEXT NOT NULL,
      permissions TEXT DEFAULT 'posts:read,posts:write,posts:publish',
      last_used_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  // Create posts table
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      content_key TEXT NOT NULL,
      excerpt TEXT,
      tags TEXT DEFAULT '[]',
      status TEXT DEFAULT 'draft',
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  // Create assets table
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      post_id TEXT,
      type TEXT NOT NULL,
      filename TEXT NOT NULL,
      r2_key TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL
    )
  `).run();

  // Create outbox table
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `).run();

  // Create indexes
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_id ON api_keys (key_id)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys (user_id)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_posts_user_status ON posts (user_id, status)`).run();
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_user_slug ON posts (user_id, slug)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_assets_user ON assets (user_id)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_assets_post ON assets (post_id)`).run();
}

/**
 * Clean database tables
 */
export async function cleanDatabase() {
  await env.DB.prepare('DELETE FROM outbox').run();
  await env.DB.prepare('DELETE FROM assets').run();
  await env.DB.prepare('DELETE FROM posts').run();
  await env.DB.prepare('DELETE FROM api_keys').run();
  await env.DB.prepare('DELETE FROM users').run();
}
