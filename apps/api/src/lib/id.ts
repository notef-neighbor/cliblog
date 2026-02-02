import { uuidv7 } from 'uuidv7';

/**
 * Generate a UUIDv7 (time-ordered)
 * @returns UUIDv7 string with hyphens
 */
export function generateId(): string {
  return uuidv7();
}

/**
 * Generate a keyId for API keys
 * Format: first 12 characters of UUIDv7 without hyphens
 * @returns 12-character keyId
 */
export function generateKeyId(): string {
  return uuidv7().replace(/-/g, '').slice(0, 12);
}

/**
 * Get current ISO timestamp
 */
export function now(): string {
  return new Date().toISOString();
}
