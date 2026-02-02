/**
 * Public asset serving route
 * GET /assets/:id - Serve image from R2 (no auth required)
 */
import { Hono } from 'hono';
import type { Env } from '../lib/types';
import { createDb } from '../lib/db';
import { getAssetPublic } from '../services/assets';

export const publicAssetsRoute = new Hono<{ Bindings: Env }>();

// Cache headers for immutable assets
const ASSET_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
};

/**
 * GET /assets/:id - Serve asset binary
 */
publicAssetsRoute.get('/:id', async (c) => {
  const assetId = c.req.param('id');

  const db = createDb(c.env.DB);

  // Get asset metadata
  const asset = await getAssetPublic(db, assetId);

  if (!asset) {
    return c.text('Asset not found', 404);
  }

  // Get binary from R2
  const r2Object = await c.env.ASSETS_BUCKET.get(asset.r2Key);

  if (!r2Object) {
    return c.text('Asset not found in storage', 404);
  }

  // Generate ETag from asset ID (immutable content)
  const etag = `"${assetId}"`;

  // Check If-None-Match for 304
  const ifNoneMatch = c.req.header('If-None-Match');
  if (ifNoneMatch === etag) {
    return c.body(null, 304);
  }

  // Return binary with proper headers
  const contentType = asset.mimeType || 'application/octet-stream';

  return new Response(r2Object.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(asset.sizeBytes || r2Object.size),
      'ETag': etag,
      ...ASSET_CACHE_HEADERS,
    },
  });
});
