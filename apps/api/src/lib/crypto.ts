/**
 * HMAC-SHA256 based API key signing and verification
 *
 * Why HMAC instead of bcrypt?
 * - Cloudflare Workers has CPU time limits
 * - bcrypt is slow by design (100ms+)
 * - HMAC is fast (<1ms) and still secure for this use case
 */

const encoder = new TextEncoder();

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Sign a secret with HMAC-SHA256
 * @param secret - The API key secret part
 * @param hmacSecret - The server-side HMAC secret (from env)
 * @returns Base64-encoded signature
 */
export async function signSecret(secret: string, hmacSecret: string): Promise<string> {
  const key = await getHmacKey(hmacSecret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(secret),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Verify a secret against a stored signature
 * @param secret - The API key secret part to verify
 * @param storedSignature - The Base64-encoded signature from DB
 * @param hmacSecret - The server-side HMAC secret (from env)
 * @returns true if valid
 */
export async function verifySecret(
  secret: string,
  storedSignature: string,
  hmacSecret: string,
): Promise<boolean> {
  const key = await getHmacKey(hmacSecret);

  // Decode stored signature
  const signatureBytes = Uint8Array.from(atob(storedSignature), c => c.charCodeAt(0));

  return crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(secret),
  );
}

/**
 * Generate a cryptographically secure random string
 * @param length - Number of characters
 * @returns Random alphanumeric string
 */
export function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, v => chars[v % chars.length]).join('');
}
