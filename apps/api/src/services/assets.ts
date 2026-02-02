import { eq, and, desc } from 'drizzle-orm';
import { assets } from '@cliblog/db/schema';
import type { Database } from '../lib/db';
import { generateId, now } from '../lib/id';
import type { R2Bucket } from '@cloudflare/workers-types';

export interface Asset {
  id: string;
  userId: string;
  postId: string | null;
  type: string;
  filename: string;
  r2Key: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

// Supported image types
const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

// Get file extension from mime type
function getExtension(mimeType: string): string {
  const extensions: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  return extensions[mimeType] || 'bin';
}

/**
 * Validate file type
 */
export function isValidImageType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType);
}

/**
 * Upload an asset
 */
export async function uploadAsset(
  db: Database,
  assetsBucket: R2Bucket,
  userId: string,
  file: File,
  postId?: string,
): Promise<Asset> {
  const id = generateId();
  const timestamp = now();
  const extension = getExtension(file.type);
  const r2Key = `assets/${userId}/${id}.${extension}`;

  // Upload to R2
  await assetsBucket.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Save metadata to D1
  await db.insert(assets).values({
    id,
    userId,
    postId: postId ?? null,
    type: 'image',
    filename: file.name,
    r2Key,
    mimeType: file.type,
    sizeBytes: file.size,
    createdAt: timestamp,
  });

  return {
    id,
    userId,
    postId: postId ?? null,
    type: 'image',
    filename: file.name,
    r2Key,
    mimeType: file.type,
    sizeBytes: file.size,
    createdAt: timestamp,
  };
}

/**
 * Get an asset by ID (with user ownership check)
 */
export async function getAsset(
  db: Database,
  assetId: string,
  userId: string,
): Promise<Asset | null> {
  const asset = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.userId, userId)))
    .get();

  return asset ?? null;
}

/**
 * Get an asset by ID (public, no ownership check)
 */
export async function getAssetPublic(
  db: Database,
  assetId: string,
): Promise<Asset | null> {
  const asset = await db
    .select()
    .from(assets)
    .where(eq(assets.id, assetId))
    .get();

  return asset ?? null;
}

/**
 * List assets for a user
 */
export async function listAssets(
  db: Database,
  userId: string,
  postId?: string,
  limit = 20,
  offset = 0,
): Promise<{ assets: Asset[]; total: number }> {
  const conditions = [eq(assets.userId, userId)];

  if (postId) {
    conditions.push(eq(assets.postId, postId));
  }

  const results = await db
    .select()
    .from(assets)
    .where(and(...conditions))
    .orderBy(desc(assets.createdAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const countResult = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(...conditions));

  return {
    assets: results,
    total: countResult.length,
  };
}

/**
 * Delete an asset
 */
export async function deleteAsset(
  db: Database,
  assetsBucket: R2Bucket,
  assetId: string,
  userId: string,
): Promise<boolean> {
  const asset = await getAsset(db, assetId, userId);
  if (!asset) return false;

  // Delete from R2
  await assetsBucket.delete(asset.r2Key);

  // Delete from D1
  await db.delete(assets).where(eq(assets.id, assetId));

  return true;
}

/**
 * Generate the public URL for an asset
 */
export function getAssetUrl(assetId: string, extension: string, apiBaseUrl?: string): string {
  // If apiBaseUrl is provided (workers.dev), use it
  // Otherwise, fall back to production pattern
  if (apiBaseUrl) {
    return `${apiBaseUrl}/assets/${assetId}`;
  }
  // Production: img.cliblog.com (future)
  return `https://img.cliblog.com/${assetId}.${extension}`;
}

/**
 * Generate the markdown reference for an asset
 */
export function getMarkdownRef(assetId: string): string {
  return `![](asset:${assetId})`;
}
