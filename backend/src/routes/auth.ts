import { type AuthRepository } from '../db/authRepo';
import {
  type AuthEnv,
  OAUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  WEBAUTHN_CHALLENGE_COOKIE_NAME,
  base64UrlDecode,
  base64UrlEncode,
  buildCookie,
  getAuthenticatedSession,
  isAuthorizedEmail,
  parseCookies,
  signJwt,
  verifyJwt,
} from '../middleware/auth';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function randomBase64Url(bytesLen = 32): string {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function getAppOrigin(request: Request, env: AuthEnv): string {
  return env.APP_ORIGIN?.replace(/\/$/, '') || new URL(request.url).origin;
}

function isSecureRequest(request: Request, env: AuthEnv): boolean {
  return getAppOrigin(request, env).startsWith('https://');
}

/**
 * Converts an ASN.1 DER-encoded ECDSA signature into raw IEEE P1363 (r || s, 64 bytes)
 * required by Web Crypto API for ES256 (P-256).
 */
export function derToP1363(der: Uint8Array): Uint8Array {
  if (der.length === 64 && der[0] !== 0x30) return der;
  if (der[0] !== 0x30) throw new Error('Invalid DER signature header');
  let offset = 2;
  if (der[1] & 0x80) offset += der[1] & 0x7f;

  if (der[offset++] !== 0x02) throw new Error('Invalid DER R tag');
  const rLen = der[offset++];
  const rBytes = der.subarray(offset, offset + rLen);
  offset += rLen;

  if (der[offset++] !== 0x02) throw new Error('Invalid DER S tag');
  const sLen = der[offset++];
  const sBytes = der.subarray(offset, offset + sLen);

  const out = new Uint8Array(64);
  const rTrim = rBytes.length > 32 ? rBytes.subarray(rBytes.length - 32) : rBytes;
  const sTrim = sBytes.length > 32 ? sBytes.subarray(sBytes.length - 32) : sBytes;
  out.set(rTrim, 32 - rTrim.length);
  out.set(sTrim, 64 - sTrim.length);
  return out;
}

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  aud?: string;
}

interface WebAuthnRegisterBody {
  id: string;
  publicKeySpki: string;
  clientDataJSON: string;
  transports?: string[];
}

interface WebAuthnLoginBody {
  id: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
}

export async function handleAuthRoutes(
  request: Request,
  env: AuthEnv,
  authRepo: AuthRepository,
  fetcher: FetchLike = fetch,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const origin = getAppOrigin(request, env);
  const secure = isSecureRequest(request, env);
  const rpId = new URL(origin).hostname;

  // 1. GET /api/auth/me
  if (request.method === 'GET' && path === '/api/auth/me') {
    const session = await getAuthenticatedSession(request, env);
    if (!session) {
      return Response.json({ authenticated: false }, { status: 401 });
    }
    const creds = await authRepo.listCredentials();
    return Response.json({
      authenticated: true,
      email: session.email,
      hasPasskey: creds.length > 0,
    });
  }

  // 2. POST /api/auth/logout
  if (request.method === 'POST' && path === '/api/auth/logout') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': buildCookie(SESSION_COOKIE_NAME, '', 0, secure),
      },
    });
  }

  // 3. GET /api/auth/google — Initiate Google OAuth 2.0 Authorization Code flow
  if (request.method === 'GET' && path === '/api/auth/google') {
    const nonce = randomBase64Url(24);
    const stateJwt = await signJwt(
      { sub: 'oauth', email: env.APP_USER_EMAIL, purpose: 'oauth_state', nonce },
      env.APP_JWT_SECRET,
      600,
    );
    const redirectUri = `${origin}/api/auth/google/callback`;
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', nonce);
    authUrl.searchParams.set('prompt', 'select_account');

    return new Response(null, {
      status: 302,
      headers: {
        Location: authUrl.toString(),
        'Set-Cookie': buildCookie(OAUTH_STATE_COOKIE_NAME, stateJwt, 600, secure),
      },
    });
  }

  // 4. GET /api/auth/google/callback — Validate state, exchange code, enforce email allowlist
  if (request.method === 'GET' && path === '/api/auth/google/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookies = parseCookies(request.headers.get('Cookie'));
    const stateToken = cookies[OAUTH_STATE_COOKIE_NAME];

    if (!code || !state || !stateToken) {
      return Response.json({ error: 'Invalid OAuth state or missing code' }, { status: 400 });
    }
    const verifiedState = await verifyJwt(stateToken, env.APP_JWT_SECRET);
    if (!verifiedState || verifiedState.purpose !== 'oauth_state' || verifiedState.nonce !== state) {
      return Response.json({ error: 'Invalid or expired OAuth state' }, { status: 400 });
    }

    const tokenRes = await fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!tokenRes.ok) {
      return Response.json({ error: 'Google token exchange failed' }, { status: 401 });
    }
    const tokens = (await tokenRes.json()) as GoogleTokenResponse;
    if (!tokens.access_token) {
      return Response.json({ error: 'Missing Google access token' }, { status: 401 });
    }

    const userRes = await fetcher('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) {
      return Response.json({ error: 'Failed to load Google profile' }, { status: 401 });
    }
    const profile = (await userRes.json()) as GoogleUserInfo;
    const emailVerified = profile.email_verified === true || profile.email_verified === 'true';

    if (!emailVerified || !isAuthorizedEmail(profile.email, env.APP_USER_EMAIL)) {
      return Response.json({ error: 'Account not authorized' }, { status: 403 });
    }

    const sessionJwt = await signJwt(
      { sub: profile.sub ?? 'owner', email: profile.email!, purpose: 'session' },
      env.APP_JWT_SECRET,
    );

    const headers = new Headers({ Location: `${origin}/` });
    headers.append('Set-Cookie', buildCookie(SESSION_COOKIE_NAME, sessionJwt, 60 * 60 * 24 * 7, secure));
    headers.append('Set-Cookie', buildCookie(OAUTH_STATE_COOKIE_NAME, '', 0, secure));
    return new Response(null, { status: 302, headers });
  }

  // 5. POST /api/auth/google/id-token — Direct Google Identity Services ID token verification
  if (request.method === 'POST' && path === '/api/auth/google/id-token') {
    const body = (await request.json().catch(() => null)) as { idToken?: string } | null;
    if (!body?.idToken) {
      return Response.json({ error: 'Missing idToken' }, { status: 400 });
    }
    const infoRes = await fetcher(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(body.idToken)}`,
    );
    if (!infoRes.ok) {
      return Response.json({ error: 'Invalid Google ID token' }, { status: 401 });
    }
    const info = (await infoRes.json()) as GoogleUserInfo;
    const emailVerified = info.email_verified === true || info.email_verified === 'true';
    if (info.aud !== env.GOOGLE_CLIENT_ID) {
      return Response.json({ error: 'Invalid token audience' }, { status: 401 });
    }
    if (!emailVerified || !isAuthorizedEmail(info.email, env.APP_USER_EMAIL)) {
      return Response.json({ error: 'Account not authorized' }, { status: 403 });
    }

    const sessionJwt = await signJwt(
      { sub: info.sub ?? 'owner', email: info.email!, purpose: 'session' },
      env.APP_JWT_SECRET,
    );
    return new Response(JSON.stringify({ ok: true, email: info.email }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': buildCookie(SESSION_COOKIE_NAME, sessionJwt, 60 * 60 * 24 * 7, secure),
      },
    });
  }

  // 6. POST /api/auth/webauthn/register/options — Start Passkey/Fingerprint registration
  if (request.method === 'POST' && path === '/api/auth/webauthn/register/options') {
    const session = await getAuthenticatedSession(request, env);
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const challenge = randomBase64Url(32);
    const challengeJwt = await signJwt(
      { sub: session.sub, email: session.email, purpose: 'webauthn_challenge', nonce: challenge },
      env.APP_JWT_SECRET,
      300,
    );
    const existing = await authRepo.listCredentials();

    return new Response(
      JSON.stringify({
        challenge,
        rp: { name: 'Diving App', id: rpId },
        user: {
          id: base64UrlEncode(encoder.encode(session.email)),
          name: session.email,
          displayName: session.email,
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        excludeCredentials: existing.map((c) => ({ id: c.id, type: 'public-key' })),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': buildCookie(WEBAUTHN_CHALLENGE_COOKIE_NAME, challengeJwt, 300, secure),
        },
      },
    );
  }

  // 7. POST /api/auth/webauthn/register/verify — Save WebAuthn public key in D1
  if (request.method === 'POST' && path === '/api/auth/webauthn/register/verify') {
    const session = await getAuthenticatedSession(request, env);
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const cookies = parseCookies(request.headers.get('Cookie'));
    const challengeToken = cookies[WEBAUTHN_CHALLENGE_COOKIE_NAME];
    const verifiedChallenge = challengeToken
      ? await verifyJwt(challengeToken, env.APP_JWT_SECRET)
      : null;
    if (!verifiedChallenge || verifiedChallenge.purpose !== 'webauthn_challenge') {
      return Response.json({ error: 'Invalid or expired WebAuthn challenge' }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as WebAuthnRegisterBody | null;
    if (!body?.id || !body.publicKeySpki || !body.clientDataJSON) {
      return Response.json({ error: 'Missing WebAuthn registration fields' }, { status: 400 });
    }

    const clientData = JSON.parse(decoder.decode(base64UrlDecode(body.clientDataJSON))) as {
      type?: string;
      challenge?: string;
      origin?: string;
    };
    if (
      clientData.type !== 'webauthn.create' ||
      clientData.challenge !== verifiedChallenge.nonce ||
      clientData.origin !== origin
    ) {
      return Response.json({ error: 'WebAuthn clientData mismatch' }, { status: 400 });
    }

    // Validate SPKI P-256 public key is importable before storing
    try {
      await crypto.subtle.importKey(
        'spki',
        base64UrlDecode(body.publicKeySpki),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
    } catch {
      return Response.json({ error: 'Invalid ES256 SPKI public key' }, { status: 400 });
    }

    await authRepo.saveCredential(body.id, body.publicKeySpki, body.transports ?? ['internal']);
    return new Response(JSON.stringify({ ok: true, credentialId: body.id }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': buildCookie(WEBAUTHN_CHALLENGE_COOKIE_NAME, '', 0, secure),
      },
    });
  }

  // 8. POST /api/auth/webauthn/login/options — Start Passkey/Fingerprint unlock
  if (request.method === 'POST' && path === '/api/auth/webauthn/login/options') {
    const creds = await authRepo.listCredentials();
    if (creds.length === 0) {
      return Response.json({ error: 'No passkeys registered' }, { status: 404 });
    }
    const challenge = randomBase64Url(32);
    const challengeJwt = await signJwt(
      { sub: 'owner', email: env.APP_USER_EMAIL, purpose: 'webauthn_challenge', nonce: challenge },
      env.APP_JWT_SECRET,
      300,
    );

    return new Response(
      JSON.stringify({
        challenge,
        rpId,
        userVerification: 'required',
        timeout: 60000,
        allowCredentials: creds.map((c) => ({
          id: c.id,
          type: 'public-key',
          transports: JSON.parse(c.transports_json) as string[],
        })),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': buildCookie(WEBAUTHN_CHALLENGE_COOKIE_NAME, challengeJwt, 300, secure),
        },
      },
    );
  }

  // 9. POST /api/auth/webauthn/login/verify — Verify ES256 assertion & issue session JWT
  if (request.method === 'POST' && path === '/api/auth/webauthn/login/verify') {
    const cookies = parseCookies(request.headers.get('Cookie'));
    const challengeToken = cookies[WEBAUTHN_CHALLENGE_COOKIE_NAME];
    const verifiedChallenge = challengeToken
      ? await verifyJwt(challengeToken, env.APP_JWT_SECRET)
      : null;
    if (!verifiedChallenge || verifiedChallenge.purpose !== 'webauthn_challenge') {
      return Response.json({ error: 'Invalid or expired WebAuthn challenge' }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as WebAuthnLoginBody | null;
    if (!body?.id || !body.clientDataJSON || !body.authenticatorData || !body.signature) {
      return Response.json({ error: 'Missing WebAuthn assertion fields' }, { status: 400 });
    }

    const cred = await authRepo.getCredentialById(body.id);
    if (!cred) {
      return Response.json({ error: 'Unknown credential' }, { status: 401 });
    }

    const clientDataBytes = base64UrlDecode(body.clientDataJSON);
    const clientData = JSON.parse(decoder.decode(clientDataBytes)) as {
      type?: string;
      challenge?: string;
      origin?: string;
    };
    if (
      clientData.type !== 'webauthn.get' ||
      clientData.challenge !== verifiedChallenge.nonce ||
      clientData.origin !== origin
    ) {
      return Response.json({ error: 'WebAuthn clientData mismatch' }, { status: 401 });
    }

    const authDataBytes = base64UrlDecode(body.authenticatorData);
    if (authDataBytes.length < 37) {
      return Response.json({ error: 'Malformed authenticatorData' }, { status: 400 });
    }
    const flags = authDataBytes[32];
    const userPresent = (flags & 0x01) !== 0;
    const userVerified = (flags & 0x04) !== 0;
    if (!userPresent || !userVerified) {
      return Response.json({ error: 'Biometric user verification required' }, { status: 401 });
    }

    const signCount = new DataView(
      authDataBytes.buffer,
      authDataBytes.byteOffset + 33,
      4,
    ).getUint32(0, false);
    if (signCount > 0 && signCount <= cred.counter) {
      return Response.json({ error: 'Stale WebAuthn counter detected' }, { status: 401 });
    }

    const clientDataHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataBytes));
    const signedData = new Uint8Array(authDataBytes.length + clientDataHash.length);
    signedData.set(authDataBytes, 0);
    signedData.set(clientDataHash, authDataBytes.length);

    let signatureOk = false;
    try {
      const publicKey = await crypto.subtle.importKey(
        'spki',
        base64UrlDecode(cred.public_key),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
      const rawSig = derToP1363(base64UrlDecode(body.signature));
      signatureOk = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        rawSig,
        signedData,
      );
    } catch {
      signatureOk = false;
    }

    if (!signatureOk) {
      return Response.json({ error: 'Invalid WebAuthn signature' }, { status: 401 });
    }

    if (signCount > cred.counter) {
      await authRepo.updateCredentialCounter(cred.id, signCount);
    }

    const sessionJwt = await signJwt(
      { sub: 'owner', email: env.APP_USER_EMAIL, purpose: 'session' },
      env.APP_JWT_SECRET,
    );
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', buildCookie(SESSION_COOKIE_NAME, sessionJwt, 60 * 60 * 24 * 7, secure));
    headers.append('Set-Cookie', buildCookie(WEBAUTHN_CHALLENGE_COOKIE_NAME, '', 0, secure));

    return new Response(JSON.stringify({ ok: true, email: env.APP_USER_EMAIL }), {
      status: 200,
      headers,
    });
  }

  return null;
}
