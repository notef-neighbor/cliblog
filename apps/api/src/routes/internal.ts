/**
 * Internal API routes for admin operations
 * Protected by INTERNAL_KEY (not for public use)
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { users } from '@cliblog/db/schema';
import type { Env } from '../lib/types';
import { createDb } from '../lib/db';
import { generateId, now } from '../lib/id';
import { generateApiKey } from '../services/auth';
import { AppError } from '../middleware/error';

export const internalRoutes = new Hono<{ Bindings: Env }>();

// Verify internal key middleware
internalRoutes.use('/*', async (c, next) => {
  const internalKey = c.req.header('X-Internal-Key');

  if (!internalKey || internalKey !== c.env.INTERNAL_KEY) {
    throw new AppError(
      'internal.unauthorized',
      401,
      'Unauthorized',
      'Invalid internal key',
    );
  }

  await next();
});

// POST /internal/users - Create a new user (admin only)
internalRoutes.post('/users', async (c) => {
  const body = await c.req.json<{
    email?: string | null;
    subdomain: string;
  }>();

  if (!body.subdomain) {
    throw new AppError(
      'internal.invalid_input',
      400,
      'Bad Request',
      'subdomain is required',
    );
  }

  const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
  const email = rawEmail.length > 0 ? rawEmail : null;
  if (email && !email.includes('@')) {
    throw new AppError(
      'internal.invalid_input',
      400,
      'Bad Request',
      'email must be valid when provided',
    );
  }

  const db = createDb(c.env.DB);
  const id = generateId();
  const timestamp = now();

  await db.insert(users).values({
    id,
    email,
    subdomain: body.subdomain,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return c.json({
    data: {
      id,
      type: 'user',
      attributes: {
        email,
        subdomain: body.subdomain,
        createdAt: timestamp,
      },
    },
  }, 201);
});

// POST /internal/users/:userId/keys - Create initial API key for a user
internalRoutes.post('/users/:userId/keys', async (c) => {
  const userId = c.req.param('userId');
  const body = await c.req.json<{ name?: string; permissions?: string }>();

  const db = createDb(c.env.DB);

  // Verify user exists
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!user) {
    throw new AppError(
      'internal.user_not_found',
      404,
      'Not Found',
      'User not found',
    );
  }

  const name = body.name || 'Initial Key';
  const permissions = body.permissions; // undefined = default (full permissions)
  const newKey = await generateApiKey(
    db,
    userId,
    name,
    c.env.API_KEY_SECRET,
    permissions,
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
