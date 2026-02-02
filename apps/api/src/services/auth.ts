import { eq } from 'drizzle-orm';
import { apiKeys, users } from '@cliblog/db/schema';
import type { Database } from '../lib/db';
import { generateId, generateKeyId, now } from '../lib/id';
import { signSecret, verifySecret, generateRandomString } from '../lib/crypto';
import type { ApiKey, User } from '../lib/types';

const API_KEY_PREFIX = 'sk_blog';
const SECRET_LENGTH = 32;

export interface GeneratedApiKey {
  id: string;
  keyId: string;
  name: string;
  fullKey: string; // Only returned at creation time
  permissions: string;
  createdAt: string;
}

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  keyId: string;
  signature: string;
  permissions: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

/**
 * Parse API key format: sk_blog_{keyId}_{secret}
 */
export function parseApiKey(apiKey: string): { keyId: string; secret: string } | null {
  const match = apiKey.match(/^sk_blog_([a-z0-9]+)_([a-z0-9]+)$/i);
  if (!match) return null;
  return { keyId: match[1], secret: match[2] };
}

/**
 * Generate a new API key
 */
// Default permissions for new keys (full access including key management and account deletion)
export const DEFAULT_PERMISSIONS = 'posts:read,posts:write,posts:publish,assets:read,assets:write,keys:manage,account:delete';

export async function generateApiKey(
  db: Database,
  userId: string,
  name: string,
  hmacSecret: string,
  permissions = DEFAULT_PERMISSIONS,
): Promise<GeneratedApiKey> {
  const id = generateId();
  const keyId = generateKeyId();
  const secret = generateRandomString(SECRET_LENGTH);
  const signature = await signSecret(secret, hmacSecret);
  const createdAt = now();

  const fullKey = `${API_KEY_PREFIX}_${keyId}_${secret}`;

  await db.insert(apiKeys).values({
    id,
    userId,
    name,
    keyId,
    signature,
    permissions,
    createdAt,
  });

  return {
    id,
    keyId,
    name,
    fullKey,
    permissions,
    createdAt,
  };
}

/**
 * Verify an API key and return the associated user
 */
export async function verifyApiKey(
  db: Database,
  apiKey: string,
  hmacSecret: string,
): Promise<{ user: User; apiKey: ApiKey } | null> {
  const parsed = parseApiKey(apiKey);
  if (!parsed) return null;

  // Look up by keyId (indexed)
  const record = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyId, parsed.keyId))
    .get();

  if (!record) return null;

  // Verify HMAC signature
  const isValid = await verifySecret(parsed.secret, record.signature, hmacSecret);
  if (!isValid) return null;

  // Get the user
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, record.userId))
    .get();

  if (!user) return null;

  // Update last_used_at
  await db
    .update(apiKeys)
    .set({ lastUsedAt: now() })
    .where(eq(apiKeys.id, record.id));

  return {
    user: {
      id: user.id,
      email: user.email,
      subdomain: user.subdomain,
      createdAt: user.createdAt,
    },
    apiKey: {
      id: record.id,
      userId: record.userId,
      name: record.name,
      keyId: record.keyId,
      permissions: record.permissions ?? '',
      lastUsedAt: record.lastUsedAt,
      createdAt: record.createdAt,
    },
  };
}

/**
 * List API keys for a user (without secrets)
 */
export async function listApiKeys(
  db: Database,
  userId: string,
): Promise<ApiKey[]> {
  const records = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      name: apiKeys.name,
      keyId: apiKeys.keyId,
      permissions: apiKeys.permissions,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId));

  return records.map(r => ({
    id: r.id,
    userId: r.userId,
    name: r.name,
    keyId: r.keyId,
    permissions: r.permissions ?? '',
    lastUsedAt: r.lastUsedAt,
    createdAt: r.createdAt,
  }));
}

/**
 * Delete an API key
 */
export async function deleteApiKey(
  db: Database,
  keyId: string,
): Promise<boolean> {
  const result = await db
    .delete(apiKeys)
    .where(eq(apiKeys.id, keyId))
    .returning({ id: apiKeys.id });

  return result.length > 0;
}

/**
 * Get API key by ID (for ownership verification)
 */
export async function getApiKeyById(
  db: Database,
  id: string,
): Promise<ApiKeyRecord | null> {
  const record = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.id, id))
    .get();

  return record ?? null;
}
