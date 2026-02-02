import type { Context, Next } from 'hono';
import type { Env, ApiErrorResponse } from '../lib/types';

export class AppError extends Error {
  constructor(
    public code: string,
    public status: number,
    public title: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }

  toResponse(): ApiErrorResponse {
    return {
      errors: [{
        code: this.code,
        status: this.status,
        title: this.title,
        detail: this.message,
      }],
    };
  }
}

export function errorHandler() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    try {
      await next();
    } catch (err) {
      if (err instanceof AppError) {
        return c.json(err.toResponse(), err.status as 400 | 401 | 403 | 404 | 409 | 429 | 500);
      }

      console.error('Unhandled error:', err);

      // In development, include error details
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
    }
  };
}
