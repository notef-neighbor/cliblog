import { Hono } from 'hono';
import type { Env } from '../../lib/types';
import { createDb } from '../../lib/db';
import { AppError } from '../../middleware/error';
import { requirePermission } from '../../middleware/auth';
import {
  uploadAsset,
  getAsset,
  listAssets,
  deleteAsset,
  isValidImageType,
  getAssetUrl,
  getMarkdownRef,
} from '../../services/assets';

export const assetsRoutes = new Hono<{ Bindings: Env }>();

// POST /v1/assets - Upload asset (image only in v1.0)
assetsRoutes.post('/', requirePermission('assets:write'), async (c) => {
  const auth = c.get('auth');
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const type = formData.get('type') as string | null;
  const postId = formData.get('postId') as string | null;

  if (!file) {
    throw new AppError(
      'assets.missing_file',
      400,
      'Bad Request',
      'file is required',
    );
  }

  // v1.0: only image type is supported
  if (type !== 'image') {
    throw new AppError(
      'assets.invalid_type',
      400,
      'Bad Request',
      'Only type=image is supported in v1.0',
    );
  }

  // Validate file type
  if (!isValidImageType(file.type)) {
    throw new AppError(
      'assets.invalid_file_type',
      400,
      'Bad Request',
      `Invalid file type: ${file.type}. Allowed: image/png, image/jpeg, image/gif, image/webp`,
    );
  }

  // Max file size: 10MB
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new AppError(
      'assets.file_too_large',
      400,
      'Bad Request',
      `File too large. Maximum size is 10MB`,
    );
  }

  const db = createDb(c.env.DB);
  const asset = await uploadAsset(
    db,
    c.env.ASSETS_BUCKET,
    auth.user.id,
    file,
    postId ?? undefined,
  );

  // Build API base URL from request
  const url = new URL(c.req.url);
  const apiBaseUrl = `${url.protocol}//${url.host}`;

  return c.json({
    data: {
      id: asset.id,
      type: 'asset',
      attributes: {
        assetType: asset.type,
        filename: asset.filename,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        url: getAssetUrl(asset.id, '', apiBaseUrl),
        markdownRef: getMarkdownRef(asset.id),
        createdAt: asset.createdAt,
      },
    },
  }, 201);
});

// GET /v1/assets - List assets
assetsRoutes.get('/', requirePermission('assets:read'), async (c) => {
  const auth = c.get('auth');
  const postId = c.req.query('postId');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  const db = createDb(c.env.DB);
  const { assets, total } = await listAssets(db, auth.user.id, postId, limit, offset);

  // Build API base URL from request
  const url = new URL(c.req.url);
  const apiBaseUrl = `${url.protocol}//${url.host}`;

  return c.json({
    data: assets.map(a => {
      return {
        id: a.id,
        type: 'asset',
        attributes: {
          assetType: a.type,
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          url: getAssetUrl(a.id, '', apiBaseUrl),
          markdownRef: getMarkdownRef(a.id),
          postId: a.postId,
          createdAt: a.createdAt,
        },
      };
    }),
    meta: { total, limit, offset },
  });
});

// GET /v1/assets/:id - Get asset
assetsRoutes.get('/:id', requirePermission('assets:read'), async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');

  const db = createDb(c.env.DB);
  const asset = await getAsset(db, id, auth.user.id);

  if (!asset) {
    throw new AppError(
      'assets.not_found',
      404,
      'Not Found',
      `Asset ${id} not found`,
    );
  }

  // Build API base URL from request
  const url = new URL(c.req.url);
  const apiBaseUrl = `${url.protocol}//${url.host}`;

  return c.json({
    data: {
      id: asset.id,
      type: 'asset',
      attributes: {
        assetType: asset.type,
        filename: asset.filename,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        url: getAssetUrl(asset.id, '', apiBaseUrl),
        markdownRef: getMarkdownRef(asset.id),
        postId: asset.postId,
        createdAt: asset.createdAt,
      },
    },
  });
});

// DELETE /v1/assets/:id - Delete asset
assetsRoutes.delete('/:id', requirePermission('assets:write'), async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');

  const db = createDb(c.env.DB);
  const deleted = await deleteAsset(db, c.env.ASSETS_BUCKET, id, auth.user.id);

  if (!deleted) {
    throw new AppError(
      'assets.not_found',
      404,
      'Not Found',
      `Asset ${id} not found`,
    );
  }

  return c.body(null, 204);
});
