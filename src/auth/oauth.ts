/**
 * Google OAuth 2.0 PKCE flow for a browser-only SPA.
 *
 * No backend. No client secret.
 * access_token  → sessionStorage (cleared when tab closes — XSS-safer)
 * refresh_token → localStorage   (persistent; used for silent renewal)
 *
 * Setup (one-time, Google Cloud Console):
 *  1. Enable Sheets API + Drive API.
 *  2. Create OAuth 2.0 Client ID → type "Web Application".
 *  3. Add authorized redirect URI:
 *       https://<you>.github.io/mmbs-web/#/auth/callback
 *       http://localhost:5173/#/auth/callback
 *  4. Copy the Client ID below (no secret needed with PKCE).
 *  5. Add each committee member's Gmail as a "test user" on the consent screen.
 */

import { deriveChallenge, generateVerifier } from './pkce';

// ─── Replace with your Google OAuth Client ID ──────────────────────────────
export const GOOGLE_CLIENT_ID =
  '55122045980-ma32j6npuirp5urqkr83kj3cibfkt276.apps.googleusercontent.com';
// ───────────────────────────────────────────────────────────────────────────

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ');

// Detect the redirect URI dynamically so local dev + GH Pages both work.
// Google does NOT allow '#' in redirect URIs, so we use the plain base URL.
// main.tsx intercepts the returning ?code= and rewrites it into the hash route.
function redirectUri(): string {
  const { protocol, host, pathname } = window.location;
  // Ensure trailing slash (GitHub Pages serves at /mmbs-web/)
  const path = pathname.endsWith('/') ? pathname : pathname + '/';
  return `${protocol}//${host}${path}`;
}

const SS_VERIFIER   = 'pkce_verifier';
const SS_TOKEN      = 'access_token';
const SS_TOKEN_EXP  = 'access_token_exp';  // epoch seconds
const LS_REFRESH    = 'refresh_token';
const SS_USER_EMAIL = 'user_email';

// ── Token storage helpers ──────────────────────────────────────────────────

export function getAccessToken(): string | null {
  return sessionStorage.getItem(SS_TOKEN);
}

export function getTokenExpiry(): number {
  return parseInt(sessionStorage.getItem(SS_TOKEN_EXP) ?? '0', 10);
}

export function isTokenValid(): boolean {
  const tok = getAccessToken();
  if (!tok) return false;
  return getTokenExpiry() > Date.now() / 1000 + 60; // 60-second buffer
}

export function getUserEmail(): string | null {
  return sessionStorage.getItem(SS_USER_EMAIL);
}

function storeTokens(data: {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  email?: string;
}) {
  sessionStorage.setItem(SS_TOKEN, data.access_token);
  sessionStorage.setItem(
    SS_TOKEN_EXP,
    String(Math.floor(Date.now() / 1000) + data.expires_in),
  );
  if (data.refresh_token) {
    localStorage.setItem(LS_REFRESH, data.refresh_token);
  }
  if (data.email) {
    sessionStorage.setItem(SS_USER_EMAIL, data.email);
  }
}

export function clearTokens() {
  sessionStorage.removeItem(SS_TOKEN);
  sessionStorage.removeItem(SS_TOKEN_EXP);
  sessionStorage.removeItem(SS_VERIFIER);
  sessionStorage.removeItem(SS_USER_EMAIL);
  localStorage.removeItem(LS_REFRESH);
}

// ── PKCE redirect ──────────────────────────────────────────────────────────

/** Redirect the browser to Google's consent screen. */
export async function startSignIn() {
  const verifier = generateVerifier();
  const challenge = await deriveChallenge(verifier);
  sessionStorage.setItem(SS_VERIFIER, verifier);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',   // request refresh_token
    prompt: 'select_account', // show account picker every time
  });

  window.location.href =
    'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

// ── Callback handler ───────────────────────────────────────────────────────

/**
 * Call this from the /auth/callback route.
 * Returns the access token on success, throws on failure.
 */
export async function handleCallback(code: string): Promise<string> {
  const verifier = sessionStorage.getItem(SS_VERIFIER);
  if (!verifier) throw new Error('Missing PKCE verifier — please sign in again.');

  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await res.json();

  // Decode the id_token to extract email (no signature verification needed
  // here — we just need the email for display and AppUsers gate).
  const email = extractEmailFromIdToken(data.id_token);

  storeTokens({ ...data, email });
  sessionStorage.removeItem(SS_VERIFIER);
  return data.access_token as string;
}

// ── Silent refresh ─────────────────────────────────────────────────────────

let refreshInFlight: Promise<string> | null = null;

/**
 * Ensure we have a valid token.
 * If expired (or within 5 min of expiry) silently exchanges the refresh_token.
 * Multiple concurrent callers share a single in-flight request.
 */
export async function ensureToken(): Promise<string> {
  if (isTokenValid()) return getAccessToken()!;

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refresh = localStorage.getItem(LS_REFRESH);
    if (!refresh) throw new Error('No refresh token — please sign in again.');

    const body = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      clearTokens();
      throw new Error('Token refresh failed — please sign in again.');
    }

    const data = await res.json();
    storeTokens(data);
    return data.access_token as string;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractEmailFromIdToken(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined;
  try {
    const payload = idToken.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.email as string;
  } catch {
    return undefined;
  }
}

/** True if the user has a refresh_token stored (survives page reload). */
export function hasSavedSession(): boolean {
  return !!localStorage.getItem(LS_REFRESH);
}
