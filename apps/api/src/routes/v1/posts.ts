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
} from '../../services/posts';

export const postsRoutes = new Hono<{ Bindings: Env }>();

// POST /v1/posts - Create new post
postsRoutes.post('/', requirePermission('posts:write'), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{
    title: string;
    content: string;
    slug?: string;
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
  const post = await createPost(db, c.env.CONTENT_BUCKET, auth.user.id, body);

  return c.json({
    data: {
      id: post.id,
      type: 'post',
      attributes: {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        status: post.status,
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

  // Get content from R2
  const content = await getPostContent(c.env.CONTENT_BUCKET, post.contentKey);

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
  }>();

  const db = createDb(c.env.DB);
  const updated = await updatePost(db, c.env.CONTENT_BUCKET, id, auth.user.id, body);

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
