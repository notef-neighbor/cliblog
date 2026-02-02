import { eq, and, desc } from 'drizzle-orm';
import { posts, outbox } from '@cliblog/db/schema';
import type { Database } from '../lib/db';
import { generateId, now } from '../lib/id';
import type { R2Bucket } from '@cloudflare/workers-types';

export interface CreatePostInput {
  title: string;
  content: string;
  slug?: string;
}

export interface UpdatePostInput {
  title?: string;
  content?: string;
  slug?: string;
}

export interface Post {
  id: string;
  userId: string;
  slug: string;
  title: string;
  contentKey: string;
  excerpt: string | null;
  status: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Generate a URL-friendly slug from title
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Generate a unique slug for a post
 */
async function generateUniqueSlug(
  db: Database,
  userId: string,
  title: string,
  excludePostId?: string,
): Promise<string> {
  let base = slugify(title);

  // If title produces empty slug (e.g., Japanese only), use ID prefix
  if (!base) {
    base = generateId().slice(0, 8);
  }

  // Limit to 60 characters
  base = base.slice(0, 60);

  // Check for conflicts
  let slug = base;
  let counter = 1;

  while (true) {
    const existing = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.userId, userId),
          eq(posts.slug, slug),
        ),
      )
      .get();

    if (!existing || (excludePostId && existing.id === excludePostId)) {
      break;
    }

    slug = `${base}-${counter++}`;
  }

  return slug;
}

/**
 * Generate excerpt from content (first 200 chars of text)
 */
function generateExcerpt(content: string): string {
  // Strip markdown formatting roughly
  const text = content
    .replace(/^#+\s+/gm, '') // Headers
    .replace(/\*\*|__/g, '') // Bold
    .replace(/\*|_/g, '') // Italic
    .replace(/`[^`]+`/g, '') // Code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // Images
    .replace(/\n+/g, ' ') // Newlines
    .trim();

  return text.length > 200 ? text.slice(0, 197) + '...' : text;
}

/**
 * Create a new post
 */
export async function createPost(
  db: Database,
  contentBucket: R2Bucket,
  userId: string,
  input: CreatePostInput,
): Promise<Post> {
  const id = generateId();
  const timestamp = now();
  const slug = input.slug || await generateUniqueSlug(db, userId, input.title);
  const contentKey = `content/${userId}/${id}.md`;
  const excerpt = generateExcerpt(input.content);

  // 1. Create outbox entry for tracking
  const outboxId = generateId();
  await db.insert(outbox).values({
    id: outboxId,
    entityType: 'post',
    entityId: id,
    action: 'create',
    status: 'pending',
    createdAt: timestamp,
  });

  // 2. Upload content to R2
  await contentBucket.put(contentKey, input.content, {
    httpMetadata: { contentType: 'text/markdown' },
  });

  // 3. Create post metadata in D1
  await db.insert(posts).values({
    id,
    userId,
    slug,
    title: input.title,
    contentKey,
    excerpt,
    status: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  // 4. Mark outbox as completed
  await db
    .update(outbox)
    .set({ status: 'completed' })
    .where(eq(outbox.id, outboxId));

  return {
    id,
    userId,
    slug,
    title: input.title,
    contentKey,
    excerpt,
    status: 'draft',
    publishedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Get a post by ID
 */
export async function getPost(
  db: Database,
  postId: string,
  userId: string,
): Promise<Post | null> {
  const post = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .get();

  return post ?? null;
}

/**
 * Get post content from R2
 */
export async function getPostContent(
  contentBucket: R2Bucket,
  contentKey: string,
): Promise<string | null> {
  const object = await contentBucket.get(contentKey);
  if (!object) return null;
  return object.text();
}

/**
 * List posts for a user
 */
export async function listPosts(
  db: Database,
  userId: string,
  status?: string,
  limit = 20,
  offset = 0,
): Promise<{ posts: Post[]; total: number }> {
  const conditions = [eq(posts.userId, userId)];

  if (status) {
    conditions.push(eq(posts.status, status));
  }

  const results = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .orderBy(desc(posts.createdAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const countResult = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(...conditions));

  return {
    posts: results,
    total: countResult.length,
  };
}

/**
 * Update a post
 */
export async function updatePost(
  db: Database,
  contentBucket: R2Bucket,
  postId: string,
  userId: string,
  input: UpdatePostInput,
): Promise<Post | null> {
  const existing = await getPost(db, postId, userId);
  if (!existing) return null;

  const timestamp = now();
  const updates: Partial<typeof posts.$inferInsert> = {
    updatedAt: timestamp,
  };

  if (input.title !== undefined) {
    updates.title = input.title;
  }

  if (input.slug !== undefined) {
    // Validate slug uniqueness
    const slug = await generateUniqueSlug(db, userId, input.slug, postId);
    updates.slug = slug;
  }

  if (input.content !== undefined) {
    // Update content in R2
    await contentBucket.put(existing.contentKey, input.content, {
      httpMetadata: { contentType: 'text/markdown' },
    });
    updates.excerpt = generateExcerpt(input.content);
  }

  await db
    .update(posts)
    .set(updates)
    .where(eq(posts.id, postId));

  return {
    ...existing,
    ...updates,
    updatedAt: timestamp,
  } as Post;
}

/**
 * Delete a post
 */
export async function deletePost(
  db: Database,
  contentBucket: R2Bucket,
  postId: string,
  userId: string,
): Promise<boolean> {
  const existing = await getPost(db, postId, userId);
  if (!existing) return false;

  // Delete content from R2
  await contentBucket.delete(existing.contentKey);

  // Delete from D1
  await db.delete(posts).where(eq(posts.id, postId));

  return true;
}

/**
 * Publish a post
 */
export async function publishPost(
  db: Database,
  postId: string,
  userId: string,
): Promise<Post | null> {
  const existing = await getPost(db, postId, userId);
  if (!existing) return null;

  const timestamp = now();

  await db
    .update(posts)
    .set({
      status: 'published',
      publishedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(eq(posts.id, postId));

  return {
    ...existing,
    status: 'published',
    publishedAt: timestamp,
    updatedAt: timestamp,
  };
}
