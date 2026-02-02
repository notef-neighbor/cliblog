import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { users, posts, assets } from '@cliblog/db/schema';
import type { Env } from '../../lib/types';
import { createDb } from '../../lib/db';
import { generateId, now } from '../../lib/id';
import { AppError } from '../../middleware/error';
import { authMiddleware, requirePermission, hasPermission } from '../../middleware/auth';
import {
  generateApiKey,
  listApiKeys,
  deleteApiKey,
  getApiKeyById,
} from '../../services/auth';

export const authRoutes = new Hono<{ Bindings: Env }>();

// Subdomain validation
const SUBDOMAIN_REGEX = /^[a-z][a-z0-9-]{2,29}$/;
const RESERVED_SUBDOMAINS = ['www', 'api', 'admin', 'app', 'blog', 'mail', 'ftp', 'test', 'dev', 'staging'];

// Valid permissions whitelist
const VALID_PERMISSIONS = [
  'posts:read',
  'posts:write',
  'posts:publish',
  'assets:read',
  'assets:write',
  'keys:manage',
  'account:delete',
];

/**
 * Validate and normalize permission string
 */
function validatePermissions(permStr: string): string[] {
  const perms = permStr
    .split(',')
    .map(p => p.trim().toLowerCase())
    .filter(p => p.length > 0);

  // Remove duplicates
  const unique = [...new Set(perms)];

  // Check all permissions are valid
  const invalid = unique.filter(p => !VALID_PERMISSIONS.includes(p));
  if (invalid.length > 0) {
    throw new AppError(
      'auth.invalid_permissions',
      400,
      'Bad Request',
      `Invalid permissions: ${invalid.join(', ')}. Valid: ${VALID_PERMISSIONS.join(', ')}`,
    );
  }

  return unique;
}

/**
 * Check if requested permissions are subset of caller's permissions
 */
function canGrantPermissions(callerPerms: string, requestedPerms: string[]): boolean {
  const callerPermList = callerPerms.split(',').map(p => p.trim());
  return requestedPerms.every(p => callerPermList.includes(p));
}

/**
 * GET /v1/auth/check-email - Check if email is already registered
 * Returns subdomain if exists (for guiding users to copy config)
 */
authRoutes.get('/check-email', async (c) => {
  const email = c.req.query('email');

  if (!email || !email.includes('@')) {
    throw new AppError(
      'auth.invalid_email',
      400,
      'Bad Request',
      'Valid email is required',
    );
  }

  const db = createDb(c.env.DB);

  const existingUser = await db
    .select({ subdomain: users.subdomain })
    .from(users)
    .where(eq(users.email, email))
    .get();

  return c.json({
    exists: !!existingUser,
    subdomain: existingUser?.subdomain ?? null,
  });
});

/**
 * POST /v1/auth/register - Self-service registration
 * Creates a new user and returns an API key
 */
authRoutes.post('/register', async (c) => {
  const body = await c.req.json<{
    email?: string | null;
    subdomain: string;
  }>();

  const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
  const email = rawEmail.length > 0 ? rawEmail : null;

  // Validate email only if provided
  if (email && !email.includes('@')) {
    throw new AppError(
      'auth.invalid_email',
      400,
      'Bad Request',
      'Valid email is required',
    );
  }

  // Validate subdomain format
  if (!body.subdomain || !SUBDOMAIN_REGEX.test(body.subdomain)) {
    throw new AppError(
      'auth.invalid_subdomain',
      400,
      'Bad Request',
      'Subdomain must be 3-30 characters, start with a letter, and contain only lowercase letters, numbers, and hyphens',
    );
  }

  // Check reserved subdomains
  if (RESERVED_SUBDOMAINS.includes(body.subdomain)) {
    throw new AppError(
      'auth.subdomain_reserved',
      400,
      'Bad Request',
      'This subdomain is reserved',
    );
  }

  const db = createDb(c.env.DB);

  // Check if subdomain is already taken
  const existingSubdomain = await db
    .select()
    .from(users)
    .where(eq(users.subdomain, body.subdomain))
    .get();

  if (existingSubdomain) {
    throw new AppError(
      'auth.subdomain_taken',
      409,
      'Conflict',
      'This subdomain is already taken',
    );
  }

  // Check if email is already registered (only when provided)
  if (email) {
    const existingEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (existingEmail) {
      throw new AppError(
        'auth.email_taken',
        409,
        'Conflict',
        'This email is already registered',
      );
    }
  }

  // Create user
  const userId = generateId();
  const timestamp = now();

  await db.insert(users).values({
    id: userId,
    email,
    subdomain: body.subdomain,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  // Generate initial API key
  const apiKey = await generateApiKey(
    db,
    userId,
    'Initial Key',
    c.env.API_KEY_SECRET,
  );

  // Build URLs based on current config
  const serviceDomain = c.env.SERVICE_DOMAIN || 'cliblog.com';
  const reqUrl = new URL(c.req.url);
  const apiBaseUrl = `${reqUrl.protocol}//${reqUrl.host}`;

  // Use /b/ URL until custom domain is configured
  // When SERVICE_DOMAIN has a real domain, use subdomain-based URL
  const blogUrl = serviceDomain === 'cliblog.com'
    ? `${apiBaseUrl}/b/${body.subdomain}`
    : `https://${body.subdomain}.${serviceDomain}`;

  return c.json({
    data: {
      id: userId,
      type: 'user',
      attributes: {
        email,
        subdomain: body.subdomain,
        blogUrl,
        apiKey: apiKey.fullKey, // Only shown at registration!
        createdAt: timestamp,
      },
    },
  }, 201);
});

// POST /v1/auth/keys - Create new API key
// Requires keys:manage permission
authRoutes.post('/keys', authMiddleware(), requirePermission('keys:manage'), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{ name?: string; permissions?: string }>();

  const name = body.name || 'Unnamed Key';

  // Default permissions (without keys:manage for safety)
  const defaultPerms = 'posts:read,posts:write,posts:publish,assets:read,assets:write';
  const requestedPermsStr = body.permissions || defaultPerms;

  // Validate permission string
  const requestedPerms = validatePermissions(requestedPermsStr);

  // Prevent privilege escalation: can only grant permissions you have
  if (!canGrantPermissions(auth.apiKey.permissions, requestedPerms)) {
    throw new AppError(
      'auth.privilege_escalation',
      403,
      'Forbidden',
      'Cannot grant permissions you do not have',
    );
  }

  const db = createDb(c.env.DB);
  const newKey = await generateApiKey(
    db,
    auth.user.id,
    name,
    c.env.API_KEY_SECRET,
    requestedPerms.join(','),
  );

  return c.json({
    data: {
      id: newKey.id,
      type: 'api_key',
      attributes: {
        name: newKey.name,
        keyId: newKey.keyId,
        key: newKey.fullKey, // Only shown at creation time!
        permissions: newKey.permissions,
        createdAt: newKey.createdAt,
      },
    },
  }, 201);
});

// GET /v1/auth/keys - List API keys (without secrets)
authRoutes.get('/keys', authMiddleware(), requirePermission('keys:manage'), async (c) => {
  const auth = c.get('auth');
  const db = createDb(c.env.DB);

  const keys = await listApiKeys(db, auth.user.id);

  return c.json({
    data: keys.map(k => ({
      id: k.id,
      type: 'api_key',
      attributes: {
        name: k.name,
        keyId: k.keyId,
        permissions: k.permissions,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
      },
    })),
    meta: { total: keys.length, limit: 100, offset: 0 },
  });
});

// DELETE /v1/auth/keys/:id - Revoke API key
authRoutes.delete('/keys/:id', authMiddleware(), requirePermission('keys:manage'), async (c) => {
  const auth = c.get('auth');
  const keyId = c.req.param('id');
  const db = createDb(c.env.DB);

  // Verify the key exists and belongs to this user
  const existingKey = await getApiKeyById(db, keyId);

  if (!existingKey) {
    throw new AppError(
      'auth.key_not_found',
      404,
      'Not Found',
      'API key not found',
    );
  }

  if (existingKey.userId !== auth.user.id) {
    throw new AppError(
      'auth.forbidden',
      403,
      'Forbidden',
      'Cannot delete another user\'s API key',
    );
  }

  await deleteApiKey(db, keyId);

  return c.body(null, 204);
});

// DELETE /v1/auth/account - Delete user account and all data
// Requires account:delete permission and confirmation
authRoutes.delete('/account', authMiddleware(), requirePermission('account:delete'), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{ confirm?: string }>().catch(() => ({}));

  // Require explicit confirmation
  if (body.confirm !== 'delete my account') {
    throw new AppError(
      'auth.confirmation_required',
      400,
      'Bad Request',
      'Confirmation required: send { "confirm": "delete my account" }',
    );
  }

  const db = createDb(c.env.DB);
  const userId = auth.user.id;

  // 1. Get all posts to delete their R2 content
  const userPosts = await db
    .select({ contentKey: posts.contentKey })
    .from(posts)
    .where(eq(posts.userId, userId));

  // 2. Get all assets to delete their R2 files
  const userAssets = await db
    .select({ r2Key: assets.r2Key })
    .from(assets)
    .where(eq(assets.userId, userId));

  // 3. Delete user first (cascades to api_keys, posts, assets in DB)
  // This ensures API keys are immediately invalidated
  await db.delete(users).where(eq(users.id, userId));

  // 4. Delete R2 content (posts) - best effort
  for (const post of userPosts) {
    try {
      await c.env.CONTENT_BUCKET.delete(post.contentKey);
    } catch {
      // Continue even if R2 delete fails
      console.error(`Failed to delete R2 content: ${post.contentKey}`);
    }
  }

  // 5. Delete R2 assets - best effort
  for (const asset of userAssets) {
    try {
      await c.env.ASSETS_BUCKET.delete(asset.r2Key);
    } catch {
      // Continue even if R2 delete fails
      console.error(`Failed to delete R2 asset: ${asset.r2Key}`);
    }
  }

  return c.body(null, 204);
});
