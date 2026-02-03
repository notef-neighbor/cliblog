import { eq, and, desc } from 'drizzle-orm';
import { posts, outbox } from '@cliblog/db/schema';
import type { Database } from '../lib/db';
import { generateId, now } from '../lib/id';
import type { R2Bucket } from '@cloudflare/workers-types';

export interface CreatePostInput {
  title: string;
  content: string;
  slug?: string;
  locale?: string;
  translateTo?: string[];
}

export interface UpdatePostInput {
  title?: string;
  content?: string;
  slug?: string;
  // Translation-specific fields
  translationStatus?: 'pending' | 'ready' | 'failed';
  lastTranslationError?: string;
  translationLocked?: boolean;
}

export interface Post {
  id: string;
  userId: string;
  slug: string | null;
  title: string | null;
  contentKey: string | null;
  excerpt: string | null;
  status: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // i18n fields
  locale: string | null;
  originalPostId: string | null;
  translationStatus: string | null;
  sourceRevision: string | null;
  translatedAt: string | null;
  translationLocked: number | null;
  lastTranslationError: string | null;
}

export interface TranslationInfo {
  id: string;
  locale: string;
  status: string;
  translatedAt?: string | null;
  sourceRevision?: string | null;
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
 * Generate a unique slug for a post (considering locale)
 */
async function generateUniqueSlug(
  db: Database,
  userId: string,
  title: string,
  locale: string | null,
  excludePostId?: string,
): Promise<string> {
  let base = slugify(title);

  // If title produces empty slug (e.g., Japanese only), use ID prefix
  if (!base) {
    base = generateId().slice(0, 8);
  }

  // Limit to 60 characters
  base = base.slice(0, 60);

  // Check for conflicts - now considering (user_id, slug, locale)
  let slug = base;
  let counter = 1;

  while (true) {
    // Build condition based on locale (NULL needs special handling)
    const conditions = [
      eq(posts.userId, userId),
      eq(posts.slug, slug),
    ];
    if (locale) {
      conditions.push(eq(posts.locale, locale));
    }

    const existing = await db
      .select({ id: posts.id, locale: posts.locale })
      .from(posts)
      .where(and(...conditions))
      .get();

    // If no match, or locale doesn't match (for NULL locale case), we're good
    if (!existing || (excludePostId && existing.id === excludePostId)) {
      break;
    }
    // For NULL locale, check explicitly
    if (locale === null && existing.locale !== null) {
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
): Promise<{ post: Post; translations: TranslationInfo[] }> {
  const id = generateId();
  const timestamp = now();
  const locale = input.locale || null;
  const slug = input.slug || await generateUniqueSlug(db, userId, input.title, locale);
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
    locale,
    translationStatus: 'ready',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  // 4. Mark outbox as completed
  await db
    .update(outbox)
    .set({ status: 'completed' })
    .where(eq(outbox.id, outboxId));

  // 5. Create translation placeholders if requested
  const translations: TranslationInfo[] = [];
  if (input.translateTo && input.translateTo.length > 0) {
    // NULL locale is treated as 'ja'
    const originalLocale = locale ?? 'ja';
    for (const targetLocale of input.translateTo) {
      // Skip if same as original locale
      if (targetLocale === originalLocale) continue;

      const translationId = generateId();
      await db.insert(posts).values({
        id: translationId,
        userId,
        // NULL for pending translations
        slug: null,
        title: null,
        contentKey: null,
        excerpt: null,
        status: 'draft',
        locale: targetLocale,
        originalPostId: id,
        translationStatus: 'pending',
        sourceRevision: timestamp, // Track which version we're translating
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      translations.push({
        id: translationId,
        locale: targetLocale,
        status: 'pending',
      });
    }
  }

  const post: Post = {
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
    locale,
    originalPostId: null,
    translationStatus: 'ready',
    sourceRevision: null,
    translatedAt: null,
    translationLocked: 0,
    lastTranslationError: null,
  };

  return { post, translations };
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
    // Validate slug uniqueness (use existing locale)
    const slug = await generateUniqueSlug(db, userId, input.slug, existing.locale, postId);
    updates.slug = slug;
  }

  if (input.content !== undefined) {
    let contentKey = existing.contentKey;

    // If contentKey is NULL (pending translation), create a new one
    if (!contentKey) {
      contentKey = `content/${userId}/${postId}.md`;
      updates.contentKey = contentKey;
    }

    // Upload content to R2
    await contentBucket.put(contentKey, input.content, {
      httpMetadata: { contentType: 'text/markdown' },
    });
    updates.excerpt = generateExcerpt(input.content);
  }

  // Handle translation-specific fields (only for translations)
  if (existing.originalPostId) {
    // If content is being updated, mark as ready and update metadata
    if (input.content !== undefined) {
      // Get the original post to update source_revision and check publish status
      const originalPost = await db
        .select({ updatedAt: posts.updatedAt, status: posts.status })
        .from(posts)
        .where(eq(posts.id, existing.originalPostId))
        .get();

      updates.translationStatus = 'ready';
      updates.translatedAt = timestamp;
      updates.lastTranslationError = null; // Clear any previous error
      if (originalPost) {
        updates.sourceRevision = originalPost.updatedAt;
        // Auto-publish translation if original is already published
        if (originalPost.status === 'published') {
          updates.status = 'published';
          updates.publishedAt = timestamp;
        }
      }
    }

    // Allow explicit status updates (e.g., marking as failed)
    if (input.translationStatus !== undefined) {
      // Validate that 'ready' can only be set if content exists
      if (input.translationStatus === 'ready') {
        // Check if we have the required fields (considering both existing and updates)
        const finalContentKey = updates.contentKey ?? existing.contentKey;
        const finalTitle = updates.title ?? existing.title;
        const finalSlug = updates.slug ?? existing.slug;

        if (!finalContentKey || !finalTitle || !finalSlug) {
          // Cannot set ready without required fields - ignore the status change
          // The status will only become 'ready' through content update flow
        } else {
          updates.translationStatus = input.translationStatus;
        }
      } else {
        updates.translationStatus = input.translationStatus;
      }
    }

    // Allow setting error message
    if (input.lastTranslationError !== undefined) {
      updates.lastTranslationError = input.lastTranslationError;
    }

    // Allow setting translation lock
    if (input.translationLocked !== undefined) {
      updates.translationLocked = input.translationLocked ? 1 : 0;
    }
  }

  await db
    .update(posts)
    .set(updates)
    .where(eq(posts.id, postId));

  // If this is an original post (not a translation) and content OR title was updated,
  // mark unlocked translations as pending for re-translation
  if (!existing.originalPostId && (input.content !== undefined || input.title !== undefined)) {
    await db
      .update(posts)
      .set({ translationStatus: 'pending' })
      .where(
        and(
          eq(posts.originalPostId, postId),
          eq(posts.translationLocked, 0),
        ),
      );
  }

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

  // Delete content from R2 (if exists)
  if (existing.contentKey) {
    await contentBucket.delete(existing.contentKey);
  }

  // Delete from D1
  await db.delete(posts).where(eq(posts.id, postId));

  return true;
}

/**
 * Add translation placeholders to an existing post
 */
export async function addTranslations(
  db: Database,
  postId: string,
  userId: string,
  locales: string[],
): Promise<{ translations: TranslationInfo[]; errors: string[] }> {
  const existing = await getPost(db, postId, userId);
  if (!existing) {
    return { translations: [], errors: ['Post not found'] };
  }

  // Cannot add translations to a translation
  if (existing.originalPostId) {
    return { translations: [], errors: ['Cannot add translations to a translation'] };
  }

  const timestamp = now();
  const translations: TranslationInfo[] = [];
  const errors: string[] = [];

  for (const locale of locales) {
    // Skip if same as original locale (NULL is treated as 'ja')
    const originalLocale = existing.locale ?? 'ja';
    if (locale === originalLocale) {
      errors.push(`Skipped ${locale}: same as original`);
      continue;
    }

    // Check if translation already exists
    const existingTranslation = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.originalPostId, postId),
          eq(posts.locale, locale),
        ),
      )
      .get();

    if (existingTranslation) {
      errors.push(`Skipped ${locale}: translation already exists`);
      continue;
    }

    const translationId = generateId();
    await db.insert(posts).values({
      id: translationId,
      userId,
      slug: null,
      title: null,
      contentKey: null,
      excerpt: null,
      status: 'draft',
      locale,
      originalPostId: postId,
      translationStatus: 'pending',
      sourceRevision: existing.updatedAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    translations.push({
      id: translationId,
      locale,
      status: 'pending',
      sourceRevision: existing.updatedAt,
    });
  }

  return { translations, errors };
}

/**
 * Get translations for a post
 */
export async function getTranslations(
  db: Database,
  postId: string,
  userId: string,
): Promise<TranslationInfo[]> {
  const results = await db
    .select({
      id: posts.id,
      locale: posts.locale,
      status: posts.translationStatus,
      translatedAt: posts.translatedAt,
      sourceRevision: posts.sourceRevision,
    })
    .from(posts)
    .where(
      and(
        eq(posts.originalPostId, postId),
        eq(posts.userId, userId),
      ),
    );

  return results
    .filter((r): r is { id: string; locale: string; status: string; translatedAt: string | null; sourceRevision: string | null } =>
      r.locale !== null && r.status !== null
    )
    .map(r => ({
      id: r.id,
      locale: r.locale,
      status: r.status,
      translatedAt: r.translatedAt,
      sourceRevision: r.sourceRevision,
    }));
}

/**
 * Get a translation by locale
 */
export async function getTranslationByLocale(
  db: Database,
  postId: string,
  userId: string,
  locale: string,
): Promise<Post | null> {
  const translation = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.originalPostId, postId),
        eq(posts.userId, userId),
        eq(posts.locale, locale),
      ),
    )
    .get();

  return translation ?? null;
}

/**
 * Publish a post (and its ready translations if this is an original)
 */
export async function publishPost(
  db: Database,
  postId: string,
  userId: string,
): Promise<Post | null> {
  const existing = await getPost(db, postId, userId);
  if (!existing) return null;

  const timestamp = now();

  // Publish the post itself
  await db
    .update(posts)
    .set({
      status: 'published',
      publishedAt: timestamp,
      updatedAt: timestamp,
    })
    .where(eq(posts.id, postId));

  // If this is an original post (not a translation), also publish ready translations
  if (!existing.originalPostId) {
    await db
      .update(posts)
      .set({
        status: 'published',
        publishedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(posts.originalPostId, postId),
          eq(posts.translationStatus, 'ready'),
        ),
      );
  }

  return {
    ...existing,
    status: 'published',
    publishedAt: timestamp,
    updatedAt: timestamp,
  };
}
