import { type AppRepository, type DivePatch, type UserSettingsRecord } from '../db/repository';
import {
  type AuthEnv,
  OAUTH_STATE_COOKIE_NAME,
  base64UrlEncode,
  buildCookie,
  parseCookies,
  requireAuth,
  signJwt,
  verifyJwt,
} from '../middleware/auth';
import {
  type R2Archiver,
  type SuuntoEnv,
  buildSuuntoAuthorizeUrl,
  exchangeSuuntoCode,
  ingestFitBytes,
  syncSuuntoWorkouts,
} from '../services/suuntoSync';
import { type FetchLike } from './auth';

export type FullBackendEnv = AuthEnv & SuuntoEnv;

function getOrigin(request: Request, env: AuthEnv): string {
  return env.APP_ORIGIN?.replace(/\/$/, '') || new URL(request.url).origin;
}

export async function handleApiRoutes(params: {
  request: Request;
  env: FullBackendEnv;
  repo: AppRepository;
  bucket: R2Archiver;
  fetcher?: FetchLike;
}): Promise<Response | null> {
  const { request, env, repo, bucket, fetcher = fetch } = params;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const origin = getOrigin(request, env);
  const secure = origin.startsWith('https://');

  // Public Webhook from Suunto Cloud API (authenticated via shared webhook secret)
  if (method === 'POST' && path === '/api/webhooks/suunto') {
    const providedSecret =
      request.headers.get('Ocp-Apim-Subscription-Key') ||
      request.headers.get('X-Webhook-Secret') ||
      url.searchParams.get('secret');
    if (!env.SUUNTO_WEBHOOK_SECRET || providedSecret !== env.SUUNTO_WEBHOOK_SECRET) {
      return Response.json({ error: 'Invalid webhook secret' }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { workoutKey?: string };
    const result = await syncSuuntoWorkouts({
      repo,
      bucket,
      env,
      workoutKeyFilter: body.workoutKey,
      fetcher,
    });
    return Response.json({ ok: true, ...result });
  }

  // All remaining /api/* routes require authenticated owner session
  if (!path.startsWith('/api/')) return null;

  const authCheck = await requireAuth(request, env);
  if ('response' in authCheck) return authCheck.response;

  // --- Suunto OAuth & Sync ---
  if (method === 'GET' && path === '/api/suunto/status') {
    const tokens = await repo.getSuuntoTokens();
    return Response.json({
      connected: Boolean(tokens),
      expiresAt: tokens?.expires_at ?? null,
    });
  }

  if (method === 'GET' && path === '/api/suunto/connect') {
    const raw = new Uint8Array(24);
    crypto.getRandomValues(raw);
    const nonce = base64UrlEncode(raw);
    const stateJwt = await signJwt(
      { sub: 'suunto_oauth', email: env.APP_USER_EMAIL, purpose: 'oauth_state', nonce },
      env.APP_JWT_SECRET,
      600,
    );
    return new Response(null, {
      status: 302,
      headers: {
        Location: buildSuuntoAuthorizeUrl(env, origin, nonce),
        'Set-Cookie': buildCookie(OAUTH_STATE_COOKIE_NAME, stateJwt, 600, secure),
      },
    });
  }

  if (method === 'GET' && path === '/api/suunto/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const stateToken = parseCookies(request.headers.get('Cookie'))[OAUTH_STATE_COOKIE_NAME];
    const verified = stateToken ? await verifyJwt(stateToken, env.APP_JWT_SECRET) : null;
    if (!code || !state || !verified || verified.nonce !== state) {
      return Response.json({ error: 'Invalid Suunto OAuth state' }, { status: 400 });
    }
    const tokens = await exchangeSuuntoCode(code, env, origin, fetcher);
    await repo.saveSuuntoTokens(tokens);
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${origin}/settings?suunto=connected`,
        'Set-Cookie': buildCookie(OAUTH_STATE_COOKIE_NAME, '', 0, secure),
      },
    });
  }

  if (method === 'DELETE' && path === '/api/suunto/disconnect') {
    await repo.clearSuuntoTokens();
    return Response.json({ ok: true });
  }

  if (method === 'POST' && path === '/api/sync/suunto') {
    try {
      const result = await syncSuuntoWorkouts({ repo, bucket, env, fetcher });
      return Response.json({ ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Suunto sync error';
      return Response.json({ error: message }, { status: 400 });
    }
  }

  // --- Dives & FIT Import ---
  if (method === 'POST' && path === '/api/dives/import-fit') {
    let fitBytes: Uint8Array;
    const contentType = request.headers.get('Content-Type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return Response.json({ error: 'Missing .fit file in formData' }, { status: 400 });
      }
      fitBytes = new Uint8Array(await file.arrayBuffer());
    } else {
      fitBytes = new Uint8Array(await request.arrayBuffer());
    }
    if (fitBytes.length === 0) {
      return Response.json({ error: 'Empty .fit payload' }, { status: 400 });
    }
    try {
      const res = await ingestFitBytes({ repo, bucket, fitBytes });
      const dive = await repo.getDiveById(res.diveId);
      return Response.json({ ok: true, created: res.created, dive }, { status: res.created ? 201 : 200 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid FIT file';
      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (method === 'GET' && path === '/api/dives') {
    const dives = await repo.listDives();
    return Response.json({ dives });
  }

  if (method === 'POST' && path === '/api/dives') {
    const body = (await request.json().catch(() => null)) as DivePatch | null;
    if (!body) return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    const dive = await repo.createManualDive(body);
    return Response.json({ dive }, { status: 201 });
  }

  const diveIdMatch = path.match(/^\/api\/dives\/([^/]+)$/);
  if (diveIdMatch) {
    const id = decodeURIComponent(diveIdMatch[1]);
    if (method === 'GET') {
      const dive = await repo.getDiveById(id);
      if (!dive) return Response.json({ error: 'Dive not found' }, { status: 404 });
      return Response.json({ dive });
    }
    if (method === 'PATCH') {
      const body = (await request.json().catch(() => null)) as DivePatch | null;
      if (!body) return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
      const dive = await repo.updateDive(id, body);
      if (!dive) return Response.json({ error: 'Dive not found' }, { status: 404 });
      return Response.json({ dive });
    }
    if (method === 'DELETE') {
      const deleted = await repo.deleteDive(id);
      if (!deleted) return Response.json({ error: 'Dive not found' }, { status: 404 });
      return Response.json({ ok: true });
    }
  }

  // --- Global Stats ---
  if (method === 'GET' && path === '/api/stats') {
    const stats = await repo.getGlobalStats();
    return Response.json({ stats });
  }

  // --- Dive Sites ---
  if (method === 'GET' && path === '/api/sites') {
    return Response.json({ sites: await repo.listSites() });
  }
  if (method === 'POST' && path === '/api/sites') {
    const body = (await request.json().catch(() => null)) as {
      id?: string;
      name?: string;
      latitude?: number | null;
      longitude?: number | null;
      country?: string | null;
      notes?: string | null;
    } | null;
    if (!body?.name?.trim()) return Response.json({ error: 'Site name is required' }, { status: 400 });
    const site = await repo.upsertSite({ ...body, name: body.name });
    return Response.json({ site }, { status: 201 });
  }
  const siteIdMatch = path.match(/^\/api\/sites\/([^/]+)$/);
  if (siteIdMatch) {
    const id = decodeURIComponent(siteIdMatch[1]);
    if (method === 'PATCH') {
      const body = (await request.json().catch(() => null)) as {
        name?: string;
        latitude?: number | null;
        longitude?: number | null;
        country?: string | null;
        notes?: string | null;
      } | null;
      if (!body?.name?.trim()) return Response.json({ error: 'Site name is required' }, { status: 400 });
      const site = await repo.upsertSite({ ...body, id, name: body.name });
      return Response.json({ site });
    }
    if (method === 'DELETE') {
      const deleted = await repo.deleteSite(id);
      return deleted
        ? Response.json({ ok: true })
        : Response.json({ error: 'Site not found' }, { status: 404 });
    }
  }

  // --- Gear ---
  if (method === 'GET' && path === '/api/gear') {
    return Response.json({ gear: await repo.listGear() });
  }
  if (method === 'POST' && path === '/api/gear') {
    const body = (await request.json().catch(() => null)) as {
      id?: string;
      name?: string;
      category?: string;
      brand_model?: string | null;
      notes?: string | null;
    } | null;
    if (!body?.name?.trim() || !body?.category?.trim()) {
      return Response.json({ error: 'Gear name and category are required' }, { status: 400 });
    }
    const item = await repo.upsertGear({
      id: body.id,
      name: body.name,
      category: body.category,
      brand_model: body.brand_model,
      notes: body.notes,
    });
    return Response.json({ item }, { status: 201 });
  }
  const gearIdMatch = path.match(/^\/api\/gear\/([^/]+)$/);
  if (gearIdMatch && method === 'DELETE') {
    const deleted = await repo.deleteGear(decodeURIComponent(gearIdMatch[1]));
    return deleted
      ? Response.json({ ok: true })
      : Response.json({ error: 'Gear item not found' }, { status: 404 });
  }

  // --- Certifications ---
  if (method === 'GET' && path === '/api/certifications') {
    return Response.json({ certifications: await repo.listCertifications() });
  }
  if (method === 'POST' && path === '/api/certifications') {
    const body = (await request.json().catch(() => null)) as {
      id?: string;
      agency?: string;
      level?: string;
      cert_number?: string | null;
      issued_date?: string | null;
    } | null;
    if (!body?.agency?.trim() || !body?.level?.trim()) {
      return Response.json({ error: 'Agency and level are required' }, { status: 400 });
    }
    const certification = await repo.upsertCertification({
      id: body.id,
      agency: body.agency,
      level: body.level,
      cert_number: body.cert_number,
      issued_date: body.issued_date,
    });
    return Response.json({ certification }, { status: 201 });
  }
  const certIdMatch = path.match(/^\/api\/certifications\/([^/]+)$/);
  if (certIdMatch && method === 'DELETE') {
    const deleted = await repo.deleteCertification(decodeURIComponent(certIdMatch[1]));
    return deleted
      ? Response.json({ ok: true })
      : Response.json({ error: 'Certification not found' }, { status: 404 });
  }

  // --- User Settings ---
  if (method === 'GET' && path === '/api/settings') {
    return Response.json({ settings: await repo.getSettings() });
  }
  if (method === 'PATCH' && path === '/api/settings') {
    const body = (await request.json().catch(() => null)) as Partial<UserSettingsRecord> | null;
    if (!body) return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    const settings = await repo.updateSettings(body);
    return Response.json({ settings });
  }

  return null;
}
