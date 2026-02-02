import type { Context, Next } from 'hono';
import type { Env, AuthContext } from '../lib/types';
import { createDb } from '../lib/db';
import { verifyApiKey, parseApiKey } from '../services/auth';
import { AppError } from './error';

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

export function authMiddleware() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError(
        'auth.missing_key',
        401,
        'Unauthorized',
        'Missing or invalid Authorization header',
      );
    }

    const apiKey = authHeader.slice(7); // Remove "Bearer "

    // Quick format validation (no DB call)
    const parsed = parseApiKey(apiKey);
    if (!parsed) {
      throw new AppError(
        'auth.invalid_key',
        401,
        'Unauthorized',
        'Invalid API key format',
      );
    }

    // Verify key with HMAC and get user
    const db = createDb(c.env.DB);
    const result = await verifyApiKey(db, apiKey, c.env.API_KEY_SECRET);

    if (!result) {
      throw new AppError(
        'auth.invalid_key',
        401,
        'Unauthorized',
        'Invalid API key',
      );
    }

    // Set auth context for downstream handlers
    c.set('auth', result);

    await next();
  };
}

/**
 * Check if the current user has a specific permission
 */
export function hasPermission(permissions: string, required: string): boolean {
  const perms = permissions.split(',').map(p => p.trim());
  return perms.includes(required);
}

/**
 * Middleware to require specific permission
 */
export function requirePermission(permission: string) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const auth = c.get('auth');

    if (!hasPermission(auth.apiKey.permissions, permission)) {
      throw new AppError(
        'auth.insufficient_permissions',
        403,
        'Forbidden',
        `Missing required permission: ${permission}`,
      );
    }

    await next();
  };
}
