import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

export interface Env {
  // D1 Database
  DB: D1Database;

  // R2 Buckets
  CONTENT_BUCKET: R2Bucket;
  ASSETS_BUCKET: R2Bucket;

  // Secrets
  INTERNAL_KEY: string;
  API_KEY_SECRET: string;

  // Configuration
  SERVICE_DOMAIN: string;
  ENVIRONMENT: 'development' | 'staging' | 'production';
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyId: string;
  permissions: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  subdomain: string;
  createdAt: string;
}

export interface AuthContext {
  user: User;
  apiKey: ApiKey;
}

// JSON:API style response types
export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiListResponse<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface ApiError {
  code: string;
  status: number;
  title: string;
  detail: string;
}

export interface ApiErrorResponse {
  errors: ApiError[];
}
