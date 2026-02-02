import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { authRoutes } from './routes/v1/auth';
import { postsRoutes } from './routes/v1/posts';
import { assetsRoutes } from './routes/v1/assets';
import { internalRoutes } from './routes/internal';
import { publicRoutes } from './routes/public';
import { publicAssetsRoute } from './routes/publicAssets';
import { previewRoutes } from './routes/preview';
import { blogRoutes } from './routes/blog';
import { installRoutes } from './routes/install';
import { errorHandler } from './middleware/error';
import { rateLimiter } from './middleware/rateLimit';
import { authMiddleware } from './middleware/auth';

import type { Env } from './lib/types';

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', logger());
app.use('*', errorHandler());
app.use('/v1/*', cors({
  origin: (origin) => {
    // Allow *.cliblog.com in production
    if (origin?.endsWith('.cliblog.com')) return origin;
    // Allow localhost in development
    if (origin?.startsWith('http://localhost')) return origin;
    return null;
  },
  credentials: true,
}));
app.use('/v1/*', rateLimiter());

// Health check (no auth required)
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Public assets (no auth required)
app.route('/assets', publicAssetsRoute);

// Preview routes (no auth required, for viewing without custom domain)
app.route('/preview', previewRoutes);

// Public blog routes (production, no preview notice)
app.route('/b', blogRoutes);

// Skill installation routes
app.route('/', installRoutes);

// API routes
const v1 = new Hono<{ Bindings: Env }>();

// Auth routes (some endpoints don't require auth)
v1.route('/auth', authRoutes);

// Protected routes
v1.use('/*', authMiddleware());
v1.route('/posts', postsRoutes);
v1.route('/assets', assetsRoutes);

app.route('/v1', v1);

// Internal admin routes (protected by INTERNAL_KEY)
app.route('/internal', internalRoutes);

// Global error handler
app.onError((err, c) => {
  if (err instanceof Error && 'code' in err && 'status' in err) {
    // AppError
    const appErr = err as Error & { code: string; status: number; title: string };
    return c.json({
      errors: [{
        code: appErr.code,
        status: appErr.status,
        title: appErr.title,
        detail: appErr.message,
      }],
    }, appErr.status as 400 | 401 | 403 | 404 | 409 | 429 | 500);
  }

  console.error('Unhandled error:', err);

  const detail = c.env.ENVIRONMENT === 'development' && err instanceof Error
    ? err.message
    : 'An unexpected error occurred';

  return c.json({
    errors: [{
      code: 'internal.server_error',
      status: 500,
      title: 'Internal Server Error',
      detail,
    }],
  }, 500);
});

// Public blog routes (for subdomain access)
// These are checked last, after all API routes
app.route('/', publicRoutes);

// 404 handler
app.notFound((c) => {
  const host = c.req.header('Host') || '';
  const serviceDomain = c.env.SERVICE_DOMAIN || 'cliblog.com';

  // Check if this is a subdomain request (public blog)
  const isSubdomain = host.includes('.') &&
    !host.startsWith('api.') &&
    !host.startsWith('localhost') &&
    host !== serviceDomain;

  if (isSubdomain) {
    // For public blog, return simple 404
    return c.text('Page not found', 404);
  }

  // For API, return JSON error
  return c.json({
    errors: [{
      code: 'not_found',
      status: 404,
      title: 'Not Found',
      detail: `Route ${c.req.method} ${c.req.path} not found`,
    }],
  }, 404);
});

export default app;
