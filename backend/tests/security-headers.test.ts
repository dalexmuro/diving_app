import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../src/index';

const MOCK_ENV = {
  DB: {} as D1Database,
  FIT_BUCKET: {} as R2Bucket,
  ENVIRONMENT: 'test',
  APP_JWT_SECRET: 'dummy_test_secret_for_headers_check_123456',
  APP_USER_EMAIL: 'diver@example.com',
  APP_ORIGIN: 'https://diving.example.com',
  GOOGLE_CLIENT_ID: 'dummy_google_client_id',
  GOOGLE_CLIENT_SECRET: 'dummy_google_client_secret',
  SUUNTO_CLIENT_ID: 'dummy_suunto_client_id',
  SUUNTO_CLIENT_SECRET: 'dummy_suunto_client_secret',
  SUUNTO_SUBSCRIPTION_KEY: 'dummy_suunto_sub_key',
  SUUNTO_WEBHOOK_SECRET: 'dummy_suunto_webhook_secret',
} as unknown as Env;

describe('API HTTP caching security headers', () => {
  it('sets Cache-Control: no-store, private on private /api/* and /api/auth/* responses', async () => {
    const authRes = await worker.fetch(
      new Request('https://diving.example.com/api/auth/me'),
      MOCK_ENV,
    );
    expect(authRes.headers.get('Cache-Control')).toContain('no-store');
    expect(authRes.headers.get('Cache-Control')).toContain('private');

    const divesRes = await worker.fetch(
      new Request('https://diving.example.com/api/dives'),
      MOCK_ENV,
    );
    expect(divesRes.status).toBe(401);
    expect(divesRes.headers.get('Cache-Control')).toContain('no-store');
    expect(divesRes.headers.get('Cache-Control')).toContain('private');
  });

  it('keeps /api/health lightweight and 200 OK', async () => {
    const healthRes = await worker.fetch(
      new Request('https://diving.example.com/api/health'),
      MOCK_ENV,
    );
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get('Cache-Control')).toBeNull();
  });
});
