import { describe, expect, it } from 'vitest';
import { type AuthRepository, type WebAuthnCredentialRecord } from '../src/db/authRepo';
import {
  type AuthEnv,
  SESSION_COOKIE_NAME,
  base64UrlEncode,
  requireAuth,
  signJwt,
  verifyJwt,
} from '../src/middleware/auth';
import { type FetchLike, handleAuthRoutes } from '../src/routes/auth';

const TEST_ENV: AuthEnv = {
  APP_JWT_SECRET: 'dummy_jwt_secret_for_unit_tests_only',
  APP_USER_EMAIL: 'diver@example.com',
  GOOGLE_CLIENT_ID: 'dummy-google-client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'dummy_google_client_secret',
  APP_ORIGIN: 'https://diving.example.com',
};

function createMemoryAuthRepo(): AuthRepository {
  const store = new Map<string, WebAuthnCredentialRecord>();
  return {
    async listCredentials() {
      return [...store.values()];
    },
    async getCredentialById(id: string) {
      return store.get(id) ?? null;
    },
    async saveCredential(id: string, publicKey: string, transports: string[]) {
      store.set(id, {
        id,
        public_key: publicKey,
        counter: 0,
        transports_json: JSON.stringify(transports),
        created_at: new Date().toISOString(),
      });
    },
    async updateCredentialCounter(id: string, counter: number) {
      const existing = store.get(id);
      if (existing) existing.counter = counter;
    },
  };
}

function extractCookie(setCookieHeader: string | null, name: string): string {
  if (!setCookieHeader) throw new Error(`Missing Set-Cookie header for ${name}`);
  const match = setCookieHeader.match(new RegExp(`${name}=([^;]+)`));
  if (!match) throw new Error(`Cookie ${name} not found in ${setCookieHeader}`);
  return `${name}=${match[1]}`;
}

describe('JWT middleware & allowlist', () => {
  it('signs and verifies valid session tokens and rejects tampered or expired tokens', async () => {
    const token = await signJwt(
      { sub: 'u1', email: 'diver@example.com', purpose: 'session' },
      TEST_ENV.APP_JWT_SECRET,
      300,
    );
    const verified = await verifyJwt(token, TEST_ENV.APP_JWT_SECRET);
    expect(verified?.email).toBe('diver@example.com');

    const tampered = `${token.slice(0, -2)}xx`;
    expect(await verifyJwt(tampered, TEST_ENV.APP_JWT_SECRET)).toBeNull();

    const expired = await signJwt(
      { sub: 'u1', email: 'diver@example.com', purpose: 'session' },
      TEST_ENV.APP_JWT_SECRET,
      -5,
    );
    expect(await verifyJwt(expired, TEST_ENV.APP_JWT_SECRET)).toBeNull();
  });

  it('enforces single-user email allowlist in requireAuth', async () => {
    const ownerToken = await signJwt(
      { sub: 'u1', email: 'diver@example.com', purpose: 'session' },
      TEST_ENV.APP_JWT_SECRET,
    );
    const okReq = new Request('https://diving.example.com/api/dives', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const okRes = await requireAuth(okReq, TEST_ENV);
    expect('session' in okRes && okRes.session.email).toBe('diver@example.com');

    const strangerToken = await signJwt(
      { sub: 'u2', email: 'other@example.com', purpose: 'session' },
      TEST_ENV.APP_JWT_SECRET,
    );
    const badReq = new Request('https://diving.example.com/api/dives', {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    const badRes = await requireAuth(badReq, TEST_ENV);
    expect('response' in badRes && badRes.response.status).toBe(401);
  });
});

describe('Google OAuth & ID token authentication', () => {
  it('authorizes allowlisted Google account via ID token and rejects unauthorized email', async () => {
    const repo = createMemoryAuthRepo();
    const mockFetch: FetchLike = async (url) => {
      const u = String(url);
      if (u.includes('good-token')) {
        return Response.json({
          sub: 'google-123',
          email: 'diver@example.com',
          email_verified: 'true',
          aud: TEST_ENV.GOOGLE_CLIENT_ID,
        });
      }
      return Response.json({
        sub: 'google-999',
        email: 'stranger@example.com',
        email_verified: 'true',
        aud: TEST_ENV.GOOGLE_CLIENT_ID,
      });
    };

    const okRes = await handleAuthRoutes(
      new Request('https://diving.example.com/api/auth/google/id-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'good-token' }),
      }),
      TEST_ENV,
      repo,
      mockFetch,
    );
    expect(okRes?.status).toBe(200);
    expect(okRes?.headers.get('Set-Cookie')).toContain(`${SESSION_COOKIE_NAME}=`);

    const deniedRes = await handleAuthRoutes(
      new Request('https://diving.example.com/api/auth/google/id-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'stranger-token' }),
      }),
      TEST_ENV,
      repo,
      mockFetch,
    );
    expect(deniedRes?.status).toBe(403);
  });

  it('rejects OAuth callback with missing or mismatched CSRF state', async () => {
    const repo = createMemoryAuthRepo();
    const res = await handleAuthRoutes(
      new Request('https://diving.example.com/api/auth/google/callback?code=abc&state=bad'),
      TEST_ENV,
      repo,
    );
    expect(res?.status).toBe(400);
  });

  it('redirects unauthorized Google OAuth callback to UI error screen', async () => {
    const repo = createMemoryAuthRepo();
    const stateJwt = await signJwt(
      { sub: 'oauth', email: TEST_ENV.APP_USER_EMAIL, purpose: 'oauth_state', nonce: 'nonce-123' },
      TEST_ENV.APP_JWT_SECRET,
      600,
    );
    const mockFetch: FetchLike = async (url) => {
      const u = String(url);
      if (u.includes('oauth2.googleapis.com/token')) {
        return Response.json({ access_token: 'mock-access-token' });
      }
      return Response.json({
        sub: 'google-other',
        email: 'stranger@example.com',
        email_verified: true,
      });
    };

    const res = await handleAuthRoutes(
      new Request('https://diving.example.com/api/auth/google/callback?code=ok&state=nonce-123', {
        headers: { Cookie: `diving_oauth_state=${stateJwt}` },
      }),
      TEST_ENV,
      repo,
      mockFetch,
    );
    expect(res?.status).toBe(302);
    expect(res?.headers.get('Location')).toBe('https://diving.example.com/?auth_error=unauthorized');
  });
});

describe('WebAuthn / Passkey biometric registration and unlock', () => {
  it('registers an ES256 passkey and verifies biometric login signature + counter', async () => {
    const repo = createMemoryAuthRepo();
    const sessionJwt = await signJwt(
      { sub: 'owner', email: TEST_ENV.APP_USER_EMAIL, purpose: 'session' },
      TEST_ENV.APP_JWT_SECRET,
    );
    const sessionCookie = `${SESSION_COOKIE_NAME}=${sessionJwt}`;

    // 1. Request registration options
    const regOptsRes = await handleAuthRoutes(
      new Request('https://diving.example.com/api/auth/webauthn/register/options', {
        method: 'POST',
        headers: { Cookie: sessionCookie },
      }),
      TEST_ENV,
      repo,
    );
    expect(regOptsRes?.status).toBe(200);
    const regOpts = (await regOptsRes!.json()) as { challenge: string };
    const regChallengeCookie = extractCookie(
      regOptsRes!.headers.get('Set-Cookie'),
      'diving_webauthn_challenge',
    );

    // 2. Generate real P-256 keypair and submit registration
    const keyPair = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const spkiBytes = new Uint8Array(
      (await crypto.subtle.exportKey('spki', keyPair.publicKey)) as ArrayBuffer,
    );
    const regClientData = base64UrlEncode(
      new TextEncoder().encode(
        JSON.stringify({
          type: 'webauthn.create',
          challenge: regOpts.challenge,
          origin: TEST_ENV.APP_ORIGIN,
        }),
      ),
    );

    const regVerifyRes = await handleAuthRoutes(
      new Request('https://diving.example.com/api/auth/webauthn/register/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${sessionCookie}; ${regChallengeCookie}`,
        },
        body: JSON.stringify({
          id: 'cred-android-fingerprint-1',
          publicKeySpki: base64UrlEncode(spkiBytes),
          clientDataJSON: regClientData,
          transports: ['internal'],
        }),
      }),
      TEST_ENV,
      repo,
    );
    expect(regVerifyRes?.status).toBe(200);

    // 3. Request login options
    const loginOptsRes = await handleAuthRoutes(
      new Request('https://diving.example.com/api/auth/webauthn/login/options', {
        method: 'POST',
      }),
      TEST_ENV,
      repo,
    );
    expect(loginOptsRes?.status).toBe(200);
    const loginOpts = (await loginOptsRes!.json()) as { challenge: string };
    const loginChallengeCookie = extractCookie(
      loginOptsRes!.headers.get('Set-Cookie'),
      'diving_webauthn_challenge',
    );

    // 4. Sign real authenticatorData (UP + UV flags = 0x05, counter = 1) || SHA-256(clientDataJSON)
    const loginClientDataBytes = new TextEncoder().encode(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: loginOpts.challenge,
        origin: TEST_ENV.APP_ORIGIN,
      }),
    );
    const authData = new Uint8Array(37);
    authData[32] = 0x05; // UP | UV
    new DataView(authData.buffer).setUint32(33, 1, false);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', loginClientDataBytes));
    const payload = new Uint8Array(authData.length + hash.length);
    payload.set(authData, 0);
    payload.set(hash, authData.length);

    const signature = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, payload),
    );

    const loginVerifyRes = await handleAuthRoutes(
      new Request('https://diving.example.com/api/auth/webauthn/login/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: loginChallengeCookie,
        },
        body: JSON.stringify({
          id: 'cred-android-fingerprint-1',
          clientDataJSON: base64UrlEncode(loginClientDataBytes),
          authenticatorData: base64UrlEncode(authData),
          signature: base64UrlEncode(signature),
        }),
      }),
      TEST_ENV,
      repo,
    );
    expect(loginVerifyRes?.status).toBe(200);
    expect((await repo.getCredentialById('cred-android-fingerprint-1'))?.counter).toBe(1);

    // 5. Reject tampered signature
    signature[0] ^= 0xff;
    const badVerifyRes = await handleAuthRoutes(
      new Request('https://diving.example.com/api/auth/webauthn/login/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: loginChallengeCookie,
        },
        body: JSON.stringify({
          id: 'cred-android-fingerprint-1',
          clientDataJSON: base64UrlEncode(loginClientDataBytes),
          authenticatorData: base64UrlEncode(authData),
          signature: base64UrlEncode(signature),
        }),
      }),
      TEST_ENV,
      repo,
    );
    expect(badVerifyRes?.status).toBe(401);
  });
});
