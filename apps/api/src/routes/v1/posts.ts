import { Hono } from 'hono';
import type { Env } from '../../lib/types';
import { createDb } from '../../lib/db';
import { AppError } from '../../middleware/error';
import { requirePermission } from '../../middleware/auth';
import {
  createPost,
  getPost,
  getPostContent,
  listPosts,
  updatePost,
  deletePost,
  publishPost,
  addTranslations,
  getTranslations,
  getTranslationByLocale,
} from '../../services/posts';

export const postsRoutes = new Hono<{ Bindings: Env }>();

// POST /v1/posts - Create new post
postsRoutes.post('/', requirePermission('posts:write'), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{
    title: string;
    content: string;
    slug?: string;
    locale?: string;
    translate_to?: string[];
  }>();

  if (!body.title || !body.content) {
    throw new AppError(
      'posts.invalid_input',
      400,
      'Bad Request',
      'title and content are required',
    );
  }

  const db = createDb(c.env.DB);
  const { post, translations } = await createPost(db, c.env.CONTENT_BUCKET, auth.user.id, {
    title: body.title,
    content: body.content,
    slug: body.slug,
    locale: body.locale,
    translateTo: body.translate_to,
  });

  return c.json({
    data: {
      id: post.id,
      type: 'post',
      attributes: {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        status: post.status,
        locale: post.locale,
        translations: translations.length > 0 ? translations : undefined,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      },
    },
  }, 201);
});

// GET /v1/posts - List posts
postsRoutes.get('/', requirePermission('posts:read'), async (c) => {
  const auth = c.get('auth');
  const status = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  const db = createDb(c.env.DB);
  const { posts, total } = await listPosts(db, auth.user.id, status, limit, offset);

  return c.json({
    data: posts.map(p => ({
      id: p.id,
      type: 'post',
      attributes: {
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt,
        status: p.status,
        publishedAt: p.publishedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      },
    })),
    meta: { total, limit, offset },
  });
});

// GET /v1/posts/:id - Get post (returns raw Markdown)
postsRoutes.get('/:id', requirePermission('posts:read'), async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');

  const db = createDb(c.env.DB);
  const post = await getPost(db, id, auth.user.id);

  if (!post) {
    throw new AppError(
      'posts.not_found',
      404,
      'Not Found',
      `Post ${id} not found`,
    );
  }

  // Get content from R2 (only if contentKey exists - pending translations have no content)
  const content = post.contentKey
    ? await getPostContent(c.env.CONTENT_BUCKET, post.contentKey)
    : null;

  return c.json({
    data: {
      id: post.id,
      type: 'post',
      attributes: {
        title: post.title,
        slug: post.slug,
        content, // Raw Markdown
        excerpt: post.excerpt,
        status: post.status,
        publishedAt: post.publishedAt,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      },
    },
  });
});

// PUT /v1/posts/:id - Update post
postsRoutes.put('/:id', requirePermission('posts:write'), async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const body = await c.req.json<{
    title?: string;
    content?: string;
    slug?: string;
    // Translation-specific fields
    translation_status?: 'pending' | 'ready' | 'failed';
    last_translation_error?: string;
    translation_locked?: boolean;
  }>();

  const db = createDb(c.env.DB);
  const updated = await updatePost(db, c.env.CONTENT_BUCKET, id, auth.user.id, {
    title: body.title,
    content: body.content,
    slug: body.slug,
    translationStatus: body.translation_status,
    lastTranslationError: body.last_translation_error,
    translationLocked: body.translation_locked,
  });

  if (!updated) {
    throw new AppError(
      'posts.not_found',
      404,
      'Not Found',
      `Post ${id} not found`,
    );
  }

  return c.json({
    data: {
      id: updated.id,
      type: 'post',
      attributes: {
        title: updated.title,
        slug: updated.slug,
        excerpt: updated.excerpt,
        status: updated.status,
        updatedAt: updated.updatedAt,
      },
    },
  });
});

// DELETE /v1/posts/:id - Delete post
postsRoutes.delete('/:id', requirePermission('posts:write'), async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');

  const db = createDb(c.env.DB);
  const deleted = await deletePost(db, c.env.CONTENT_BUCKET, id, auth.user.id);

  if (!deleted) {
    throw new AppError(
      'posts.not_found',
      404,
      'Not Found',
      `Post ${id} not found`,
    );
  }

  return c.body(null, 204);
});

// POST /v1/posts/:id/publish - Publish post
postsRoutes.post('/:id/publish', requirePermission('posts:publish'), async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');

  const db = createDb(c.env.DB);
  const published = await publishPost(db, id, auth.user.id);

  if (!published) {
    throw new AppError(
      'posts.not_found',
      404,
      'Not Found',
      `Post ${id} not found`,
    );
  }

  return c.json({
    data: {
      id: published.id,
      type: 'post',
      attributes: {
        status: published.status,
        publishedAt: published.publishedAt,
        updatedAt: published.updatedAt,
      },
    },
  });
});

// POST /v1/posts/:id/translations - Add translations to an existing post
postsRoutes.post('/:id/translations', requirePermission('posts:write'), async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const body = await c.req.json<{
    locales: string[];
  }>();

  if (!body.locales || !Array.isArray(body.locales) || body.locales.length === 0) {
    throw new AppError(
      'posts.invalid_input',
      400,
      'Bad Request',
      'locales array is required',
    );
  }

  const db = createDb(c.env.DB);
  const result = await addTranslations(db, id, auth.user.id, body.locales);

  if (result.translations.length === 0 && result.errors.length > 0) {
    throw new AppError(
      'posts.translation_failed',
      400,
      'Bad Request',
      result.errors.join('; '),
    );
  }

  return c.json({
    data: result.translations.map(t => ({
      id: t.id,
      type: 'translation',
      attributes: {
        locale: t.locale,
        status: t.status,
        sourceRevision: t.sourceRevision,
      },
    })),
    meta: {
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
  }, 201);
});

// GET /v1/posts/:id/translations - List translations for a post
postsRoutes.get('/:id/translations', requirePermission('posts:read'), async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');

  const db = createDb(c.env.DB);

  // Verify the original post exists and belongs to the user
  const post = await getPost(db, id, auth.user.id);
  if (!post) {
    throw new AppError(
      'posts.not_found',
      404,
      'Not Found',
      `Post ${id} not found`,
    );
  }

  const translations = await getTranslations(db, id, auth.user.id);

  return c.json({
    data: translations.map(t => ({
      id: t.id,
      type: 'translation',
      attributes: {
        locale: t.locale,
        status: t.status,
        translatedAt: t.translatedAt,
        sourceRevision: t.sourceRevision,
      },
    })),
  });
});

// GET /v1/posts/:id/translations/:locale - Get a specific translation
postsRoutes.get('/:id/translations/:locale', requirePermission('posts:read'), async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id');
  const locale = c.req.param('locale');

  const db = createDb(c.env.DB);

  // Get the translation
  const translation = await getTranslationByLocale(db, id, auth.user.id, locale);

  if (!translation) {
    throw new AppError(
      'posts.translation_not_found',
      404,
      'Not Found',
      `Translation for locale ${locale} not found`,
    );
  }

  // If translation is pending, return minimal info with sourceRevision
  if (translation.translationStatus === 'pending') {
    return c.json({
      data: {
        id: translation.id,
        type: 'translation',
        attributes: {
          locale: translation.locale,
          status: 'pending',
          sourceRevision: translation.sourceRevision,
        },
      },
    });
  }

  // Get content from R2 if available
  const content = translation.contentKey
    ? await getPostContent(c.env.CONTENT_BUCKET, translation.contentKey)
    : null;

  return c.json({
    data: {
      id: translation.id,
      type: 'translation',
      attributes: {
        locale: translation.locale,
        status: translation.translationStatus,
        title: translation.title,
        slug: translation.slug,
        content,
        excerpt: translation.excerpt,
        translatedAt: translation.translatedAt,
        sourceRevision: translation.sourceRevision,
        translationLocked: translation.translationLocked === 1,
      },
    },
  });
});
