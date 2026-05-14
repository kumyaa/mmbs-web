/**
 * PKCE helpers for OAuth 2.0 Authorization Code flow.
 * Uses the Web Crypto API — available in all modern browsers.
 */

function base64UrlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/** Generate a cryptographically random code_verifier (43-128 chars, URL-safe). */
export function generateVerifier(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr.buffer);
}

/** Derive code_challenge = BASE64URL(SHA-256(verifier)). */
export async function deriveChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return base64UrlEncode(hash);
}
