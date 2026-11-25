export interface AuthEnv {
  APP_JWT_SECRET: string;
  APP_USER_EMAIL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APP_ORIGIN?: string;
}

export interface SessionPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
  purpose?: 'session' | 'oauth_state' | 'webauthn_challenge';
  nonce?: string;
}

export const SESSION_COOKIE_NAME = 'diving_session';
export const OAUTH_STATE_COOKIE_NAME = 'diving_oauth_state';
export const WEBAUTHN_CHALLENGE_COOKIE_NAME = 'diving_webauthn_challenge';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signJwt(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 7,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importHmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput)));
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  try {
    const key = await importHmacKey(secret);
    const sigBytes = base64UrlDecode(sigB64);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      encoder.encode(`${headerB64}.${payloadB64}`),
    );
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(base64UrlDecode(payloadB64))) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (name) result[name] = decodeURIComponent(val);
  }
  return result;
}

export function buildCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  isSecure: boolean,
): string {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isSecure) attrs.push('Secure');
  return attrs.join('; ');
}

export function isAuthorizedEmail(email: string | undefined, allowlistedEmail: string): boolean {
  if (!email || !allowlistedEmail) return false;
  return email.trim().toLowerCase() === allowlistedEmail.trim().toLowerCase();
}

export async function getAuthenticatedSession(
  request: Request,
  env: AuthEnv,
): Promise<SessionPayload | null> {
  const authHeader = request.headers.get('Authorization');
  let token: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookies = parseCookies(request.headers.get('Cookie'));
    token = cookies[SESSION_COOKIE_NAME] ?? null;
  }
  if (!token) return null;

  const payload = await verifyJwt(token, env.APP_JWT_SECRET);
  if (!payload || payload.purpose !== 'session') return null;
  if (!isAuthorizedEmail(payload.email, env.APP_USER_EMAIL)) return null;
  return payload;
}

export async function requireAuth(
  request: Request,
  env: AuthEnv,
): Promise<{ session: SessionPayload } | { response: Response }> {
  const session = await getAuthenticatedSession(request, env);
  if (!session) {
    return { response: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { session };
}
