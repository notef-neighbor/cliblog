import type { Context, Next } from 'hono';
import type { Env } from '../lib/types';

// Simple in-memory rate limiter for development
// In production, use D1 or Durable Objects for distributed rate limiting
const requestCounts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_UNAUTHENTICATED = 20;
const MAX_REQUESTS_AUTHENTICATED = 50;

export function rateLimiter() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // Get client identifier
    const clientIp = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const isAuthenticated = !!c.req.header('Authorization');
    const maxRequests = isAuthenticated ? MAX_REQUESTS_AUTHENTICATED : MAX_REQUESTS_UNAUTHENTICATED;

    const key = `${clientIp}:${isAuthenticated ? 'auth' : 'unauth'}`;
    const now = Date.now();

    let record = requestCounts.get(key);

    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + WINDOW_MS };
      requestCounts.set(key, record);
    }

    record.count++;

    // Set rate limit headers
    c.header('X-RateLimit-Limit', maxRequests.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count).toString());
    c.header('X-RateLimit-Reset', Math.floor(record.resetAt / 1000).toString());

    if (record.count > maxRequests) {
      return c.json({
        errors: [{
          code: 'rate_limit.exceeded',
          status: 429,
          title: 'Too Many Requests',
          detail: `Rate limit exceeded. Try again in ${Math.ceil((record.resetAt - now) / 1000)} seconds.`,
        }],
      }, 429);
    }

    await next();
  };
}
