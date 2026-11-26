import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createD1Repository } from '../src/db/repository';
import { signJwt } from '../src/middleware/auth';
import { type FullBackendEnv, handleApiRoutes } from '../src/routes/api';
import { type FetchLike } from '../src/routes/auth';

const here = dirname(fileURLToPath(import.meta.url));
const migrationSql =
  readFileSync(resolve(here, '../migrations/0001_init.sql'), 'utf8') +
  '\n' +
  readFileSync(resolve(here, '../migrations/0002_catalogs_and_paliers.sql'), 'utf8') +
  '\n' +
  readFileSync(resolve(here, '../migrations/0003_ffessm_fields.sql'), 'utf8') +
  '\n' +
  readFileSync(resolve(here, '../migrations/0004_dive_types.sql'), 'utf8') +
  '\n' +
  readFileSync(resolve(here, '../migrations/0005_comfort_and_mood.sql'), 'utf8') +
  '\n' +
  readFileSync(resolve(here, '../migrations/0006_certifications_location_and_pdf.sql'), 'utf8');

const DUMMY_ENV: FullBackendEnv = {
  APP_JWT_SECRET: 'dummy_jwt_secret_for_api_tests',
  APP_USER_EMAIL: 'diver@example.com',
  GOOGLE_CLIENT_ID: 'dummy-client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'dummy_google_secret',
  APP_ORIGIN: 'https://diving.example.com',
  SUUNTO_CLIENT_ID: 'dummy-suunto-client-id',
  SUUNTO_CLIENT_SECRET: 'dummy_suunto_secret',
  SUUNTO_SUBSCRIPTION_KEY: 'dummy_suunto_sub_key',
  SUUNTO_WEBHOOK_SECRET: 'dummy_webhook_secret_token',
};

/**
 * Lightweight adapter wrapping node:sqlite DatabaseSync into the D1Database subset
 * used by createD1Repository so every real SQL statement is tested end-to-end.
 */
function createTestD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migrationSql);

  function makeStmt(sql: string, bound: SQLInputValue[] = []) {
    return {
      bind(...values: unknown[]) {
        return makeStmt(sql, values as SQLInputValue[]);
      },
      async all<T = Record<string, unknown>>() {
        const results = sqlite.prepare(sql).all(...bound) as T[];
        return { results, success: true, meta: {} };
      },
      async first<T = Record<string, unknown>>() {
        const row = sqlite.prepare(sql).get(...bound) as T | undefined;
        return row ?? null;
      },
      async run() {
        const res = sqlite.prepare(sql).run(...bound);
        return { success: true, meta: { changes: Number(res.changes) } };
      },
    };
  }

  return {
    prepare(sql: string) {
      return makeStmt(sql);
    },
    async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  } as unknown as D1Database;
}

function buildMiniFit(siteName: string, startSec: number): Uint8Array {
  const chunks: number[] = [];
  const pushU16LE = (v: number) => chunks.push(v & 0xff, (v >> 8) & 0xff);
  const pushU32LE = (v: number) =>
    chunks.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  const pushStr = (s: string, len: number) => {
    const b = new TextEncoder().encode(s);
    for (let i = 0; i < len; i++) chunks.push(b[i] ?? 0);
  };

  chunks.push(0x43, 0, 0);
  pushU16LE(206);
  chunks.push(4, 0, 1, 0x02, 1, 1, 0x02, 2, 1, 0x02, 3, 12, 0x07);
  chunks.push(0x03, 0, 1, 0x07);
  pushStr('description', 12);

  chunks.push(0x64, 0, 0);
  pushU16LE(18);
  chunks.push(4, 2, 4, 0x86, 7, 4, 0x86, 140, 4, 0x86, 141, 4, 0x86);
  chunks.push(1, 1, 12, 0);
  chunks.push(0x04);
  pushU32LE(startSec);
  pushU32LE(2400000); // 40 min
  pushU32LE(10000); // 10m avg
  pushU32LE(20000); // 20m max
  pushStr(siteName, 12);

  chunks.push(0x45, 0, 0);
  pushU16LE(20);
  chunks.push(3, 253, 4, 0x86, 92, 4, 0x86, 13, 1, 0x01);
  chunks.push(0x05);
  pushU32LE(startSec);
  pushU32LE(0);
  chunks.push(21);
  chunks.push(0x05);
  pushU32LE(startSec + 60);
  pushU32LE(20000);
  chunks.push(19);

  const dataBytes = new Uint8Array(chunks);
  const full = new Uint8Array(14 + dataBytes.length + 2);
  const hv = new DataView(full.buffer);
  hv.setUint8(0, 14);
  hv.setUint8(1, 32);
  hv.setUint16(2, 21176, true);
  hv.setUint32(4, dataBytes.length, true);
  full.set(new TextEncoder().encode('.FIT'), 8);
  full.set(dataBytes, 14);
  return full;
}

describe('REST API, R2 archival, and non-destructive Suunto sync', () => {
  it('blocks unauthenticated requests to protected /api/* endpoints', async () => {
    const repo = createD1Repository(createTestD1());
    const bucket = { put: async () => ({}) };
    const res = await handleApiRoutes({
      request: new Request('https://diving.example.com/api/dives'),
      env: DUMMY_ENV,
      repo,
      bucket,
    });
    expect(res?.status).toBe(401);
  });

  it('imports .fit into D1 + R2, preserves manual edits on re-sync, and computes global stats', async () => {
    const repo = createD1Repository(createTestD1());
    const r2Objects = new Map<string, Uint8Array>();
    const bucket = {
      async put(key: string, val: Uint8Array | ArrayBuffer) {
        r2Objects.set(key, val instanceof Uint8Array ? val : new Uint8Array(val));
      },
    };
    const token = await signJwt(
      { sub: 'owner', email: DUMMY_ENV.APP_USER_EMAIL, purpose: 'session' },
      DUMMY_ENV.APP_JWT_SECRET,
    );
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 1. Import .fit manually
    const fit1 = buildMiniFit('Coral Wall', 1100000000);
    const importRes = await handleApiRoutes({
      request: new Request('https://diving.example.com/api/dives/import-fit', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/octet-stream' },
        body: fit1,
      }),
      env: DUMMY_ENV,
      repo,
      bucket,
    });
    expect(importRes?.status).toBe(201);
    const importedBody = (await importRes!.json()) as { dive: { id: string; site_name: string } };
    const diveId = importedBody.dive.id;
    expect(importedBody.dive.site_name).toBe('Coral Wall');
    expect(r2Objects.size).toBe(1);

    // 2. Enrich dive manually (pressures, tank, ratings, notes)
    const patchRes = await handleApiRoutes({
      request: new Request(`https://diving.example.com/api/dives/${diveId}`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_pressure_bar: 200,
          end_pressure_bar: 100,
          tank_volume_l: 12,
          tank_material: 'steel',
          ballast_kg: 4,
          water_type: 'salt',
          visibility: 'excellent',
          buoyancy: 'good',
          feeling: 'excellent',
          notes: 'Sea turtle spotted',
          tags: ['reef', 'drift'],
        }),
      }),
      env: DUMMY_ENV,
      repo,
      bucket,
    });
    expect(patchRes?.status).toBe(200);
    const patched = (await patchRes!.json()) as {
      dive: { sac_l_min: number; notes: string; visibility: string };
    };
    expect(patched.dive.sac_l_min).toBe(15);

    // 3. Connect Suunto tokens and trigger webhook + sync with the SAME fit1 + a NEW fit2
    await repo.saveSuuntoTokens({
      access_token: 'dummy_suunto_access',
      refresh_token: 'dummy_suunto_refresh',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    const fit2 = buildMiniFit('Deep Wreck', 1100086400);
    const mockSuuntoFetch: FetchLike = async (url) => {
      const u = String(url);
      if (u.endsWith('/v3/workouts?limit=50')) {
        return Response.json({
          payload: [{ workoutKey: 'wk-existing' }, { workoutKey: 'wk-new' }],
        });
      }
      if (u.includes('wk-existing/fit')) return new Response(fit1, { status: 200 });
      if (u.includes('wk-new/fit')) return new Response(fit2, { status: 200 });
      return new Response('Not found', { status: 404 });
    };

    // Reject webhook with wrong secret
    const badWebhook = await handleApiRoutes({
      request: new Request('https://diving.example.com/api/webhooks/suunto', {
        method: 'POST',
        headers: { 'X-Webhook-Secret': 'wrong' },
      }),
      env: DUMMY_ENV,
      repo,
      bucket,
      fetcher: mockSuuntoFetch,
    });
    expect(badWebhook?.status).toBe(401);

    // Run manual sync -> wk-existing matches fit1 hash (skipped, NOT overwritten), wk-new is imported!
    const syncRes = await handleApiRoutes({
      request: new Request('https://diving.example.com/api/sync/suunto', {
        method: 'POST',
        headers: authHeaders,
      }),
      env: DUMMY_ENV,
      repo,
      bucket,
      fetcher: mockSuuntoFetch,
    });
    expect(syncRes?.status).toBe(200);
    expect(await syncRes!.json()).toEqual({ ok: true, imported: 1, skipped: 1 });

    // Verify manual edits on diveId were NOT overwritten!
    const afterSync = await repo.getDiveById(diveId);
    expect(afterSync?.notes).toBe('Sea turtle spotted');
    expect(afterSync?.visibility).toBe('excellent');
    expect(afterSync?.start_pressure_bar).toBe(200);
    expect(afterSync?.suunto_workout_key).toBe('wk-existing');

    // 4. Verify global stats (2 dives total, SAC computed only from the dive that has pressure/tank = 15 L/min)
    const statsRes = await handleApiRoutes({
      request: new Request('https://diving.example.com/api/stats', { headers: authHeaders }),
      env: DUMMY_ENV,
      repo,
      bucket,
    });
    const statsBody = (await statsRes!.json()) as {
      stats: { totalDives: number; avgSacLMin: number };
    };
    expect(statsBody.stats.totalDives).toBe(2);
    expect(statsBody.stats.avgSacLMin).toBe(15);
  });

  it('supports CRUD for gear, certifications, sites, and settings', async () => {
    const repo = createD1Repository(createTestD1());
    const bucket = { put: async () => ({}) };
    const token = await signJwt(
      { sub: 'owner', email: DUMMY_ENV.APP_USER_EMAIL, purpose: 'session' },
      DUMMY_ENV.APP_JWT_SECRET,
    );
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const gearRes = await handleApiRoutes({
      request: new Request('https://diving.example.com/api/gear', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Suunto Nautic', category: 'Computer' }),
      }),
      env: DUMMY_ENV,
      repo,
      bucket,
    });
    expect(gearRes?.status).toBe(201);

    const certRes = await handleApiRoutes({
      request: new Request('https://diving.example.com/api/certifications', {
        method: 'POST',
        headers,
        body: JSON.stringify({ agency: 'FFESSM', level: 'PA40' }),
      }),
      env: DUMMY_ENV,
      repo,
      bucket,
    });
    expect(certRes?.status).toBe(201);

    const settingsRes = await handleApiRoutes({
      request: new Request('https://diving.example.com/api/settings', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ language: 'fr', ascent_rate_limit_m_min: 12 }),
      }),
      env: DUMMY_ENV,
      repo,
      bucket,
    });
    expect(settingsRes?.status).toBe(200);
    expect(await settingsRes!.json()).toEqual({
      settings: { language: 'fr', unit_system: 'metric', ascent_rate_limit_m_min: 12 },
    });
  });

  it('parses .fit as draft without DB insert, auto-populates catalogs on save, handles paliers, and deletes dives', async () => {
    const repo = createD1Repository(createTestD1());
    const r2Objects = new Map<string, Uint8Array>();
    const bucket = {
      async put(key: string, val: Uint8Array | ArrayBuffer) {
        r2Objects.set(key, val instanceof Uint8Array ? val : new Uint8Array(val));
      },
    };
    const token = await signJwt(
      { sub: 'owner', email: DUMMY_ENV.APP_USER_EMAIL, purpose: 'session' },
      DUMMY_ENV.APP_JWT_SECRET,
    );
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 1. Draft parse .fit -> must NOT create any dive or R2 object
    const fit = buildMiniFit('Medes Arch', 1100500000);
    const parseRes = await handleApiRoutes({
      request: new Request('https://diving.example.com/api/dives/parse-fit', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/octet-stream' },
        body: fit,
      }),
      env: DUMMY_ENV,
      repo,
      bucket,
    });
    expect(parseRes?.status).toBe(200);
    const parsedJson = (await parseRes!.json()) as {
      parsed: { fitHash: string; maxDepthM: number; durationS: number; samples: unknown[] };
      fitBase64: string;
    };
    expect((await repo.listDives()).length).toBe(0);
    expect(r2Objects.size).toBe(0);

    // 2. Save draft dive with multiple paliers, buddies, gear, center + GPS, and custom depth/duration
    const createRes = await handleApiRoutes({
      request: new Request('https://diving.example.com/api/dives', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          started_at: '2026-07-10T09:30:00Z',
          duration_s: 3120,
          max_depth_m: 26.4,
          site_name: 'Medes Arch',
          site_latitude: 42.0475,
          site_longitude: 3.2224,
          computer_name: 'Suunto Nautic',
          dive_center: 'Costa Brava Sub',
          dive_center_location: 'L’Estartit, Spain',
          dive_center_lat: 42.0531,
          dive_center_lng: 3.1994,
          buddies: ['Arthur', 'Claire'],
          gear_used: ['Combinaison 7mm', 'Apeks XTX200'],
          deco_stops: [
            { depth_m: 6, duration_min: 2 },
            { depth_m: 3, duration_min: 5 },
          ],
          fit_hash: parsedJson.parsed.fitHash,
          fit_base64: parsedJson.fitBase64,
          samples: parsedJson.parsed.samples,
        }),
      }),
      env: DUMMY_ENV,
      repo,
      bucket,
    });
    expect(createRes?.status).toBe(201);
    const createdBody = (await createRes!.json()) as {
      dive: { id: string; deco: number; deco_time_s: number; deco_stops_json: string };
    };
    expect(createdBody.dive.deco).toBe(1);
    expect(createdBody.dive.deco_time_s).toBe(420); // 7 min
    expect(JSON.parse(createdBody.dive.deco_stops_json)).toHaveLength(2);
    expect(r2Objects.size).toBe(1);

    // 3. Verify catalogs were auto-populated (buddies, centers, computers, gear)
    expect((await repo.listBuddies()).map((b) => b.name)).toEqual(['Arthur', 'Claire']);
    expect((await repo.listCenters()).map((c) => c.name)).toEqual(['Costa Brava Sub']);
    expect((await repo.listComputers()).map((c) => c.name)).toEqual(['Suunto Nautic']);
    expect((await repo.listGear()).map((g) => g.name)).toEqual(['Apeks XTX200', 'Combinaison 7mm']);

    // 4. Edit gear item with brand, model, notes (#10 & #11)
    const gearItems = await repo.listGear();
    const editGearRes = await handleApiRoutes({
      request: new Request(`https://diving.example.com/api/gear/${gearItems[0].id}`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Regulador Principal',
          brand: 'Apeks',
          model: 'XTX200',
          notes: 'DIN 300 bar',
        }),
      }),
      env: DUMMY_ENV,
      repo,
      bucket,
    });
    expect(editGearRes?.status).toBe(200);

    // 5. Delete dive (#6)
    const delRes = await handleApiRoutes({
      request: new Request(`https://diving.example.com/api/dives/${createdBody.dive.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      }),
      env: DUMMY_ENV,
      repo,
      bucket,
    });
    expect(delRes?.status).toBe(200);
    expect((await repo.listDives()).length).toBe(0);
  });
});
