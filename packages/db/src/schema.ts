import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Users
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),                    // UUIDv7
  email: text('email').unique(),                  // Optional; not used for login
  subdomain: text('subdomain').notNull().unique(),
  theme: text('theme').default('default'),
  settings: text('settings').default('{}'),       // JSON
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// API Keys
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyId: text('key_id').notNull().unique(),       // sk_blog_{keyId}_xxx の keyId 部分
  signature: text('signature').notNull(),         // HMAC署名 (Base64)
  permissions: text('permissions').default('posts:read,posts:write,posts:publish'),
  lastUsedAt: text('last_used_at'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  keyIdIdx: uniqueIndex('idx_api_keys_key_id').on(table.keyId),
  userIdx: index('idx_api_keys_user').on(table.userId),
}));

// Posts (metadata only, content in R2)
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  contentKey: text('content_key').notNull(),      // R2 key
  excerpt: text('excerpt'),
  tags: text('tags').default('[]'),               // JSON array ※v1.0では未使用、将来拡張のため保持
  status: text('status').default('draft'),        // draft | published
  publishedAt: text('published_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  userStatusIdx: index('idx_posts_user_status').on(table.userId, table.status),
  userSlugUnique: uniqueIndex('idx_posts_user_slug').on(table.userId, table.slug),
}));

// Assets (v1.0: 画像のみ)
export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),                    // UUIDv7
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: text('post_id').references(() => posts.id, { onDelete: 'set null' }),
  type: text('type').notNull(),                   // v1.0: 'image' のみ
  filename: text('filename').notNull(),
  r2Key: text('r2_key').notNull(),
  mimeType: text('mime_type'),                    // 'image/png', 'image/jpeg', etc.
  sizeBytes: integer('size_bytes'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  userIdx: index('idx_assets_user').on(table.userId),
  postIdx: index('idx_assets_post').on(table.postId),
}));

// Outbox (D1/R2整合性のため)
export const outbox = sqliteTable('outbox', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),      // 'post', 'image'
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),               // 'create', 'update', 'delete'
  status: text('status').default('pending'),      // pending, completed, failed
  retryCount: integer('retry_count').default(0),
  createdAt: text('created_at').notNull(),
});
