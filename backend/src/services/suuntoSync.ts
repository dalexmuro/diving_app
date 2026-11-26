import { type AppRepository } from '../db/repository';
import { parseSuuntoFit } from '../fit/parser';
import { type FetchLike } from '../routes/auth';

export interface SuuntoEnv {
  SUUNTO_CLIENT_ID: string;
  SUUNTO_CLIENT_SECRET: string;
  SUUNTO_SUBSCRIPTION_KEY: string;
  SUUNTO_WEBHOOK_SECRET?: string;
}

export interface R2ObjectLike {
  body: ReadableStream | null;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Archiver {
  put(
    key: string,
    value: Uint8Array | ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get?(key: string): Promise<R2ObjectLike | null>;
  delete?(key: string): Promise<void>;
}

interface SuuntoOAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface SuuntoWorkoutListResponse {
  payload?: Array<{
    workoutKey: string;
    activityId?: number;
    startTime?: number;
  }>;
}

export function buildSuuntoAuthorizeUrl(
  env: SuuntoEnv,
  origin: string,
  state: string,
): string {
  const url = new URL('https://cloudapi-oauth.suunto.com/oauth/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.SUUNTO_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${origin}/api/suunto/callback`);
  url.searchParams.set('state', state);
  return url.toString();
}

function buildBasicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

export async function exchangeSuuntoCode(
  code: string,
  env: SuuntoEnv,
  origin: string,
  fetcher: FetchLike = fetch,
): Promise<{ access_token: string; refresh_token: string; expires_at: string }> {
  const res = await fetcher('https://cloudapi-oauth.suunto.com/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: buildBasicAuth(env.SUUNTO_CLIENT_ID, env.SUUNTO_CLIENT_SECRET),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${origin}/api/suunto/callback`,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Suunto token exchange failed (${res.status})`);
  }
  const data = (await res.json()) as SuuntoOAuthTokenResponse;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + Math.max(60, data.expires_in - 60) * 1000).toISOString(),
  };
}

export async function getValidSuuntoAccessToken(
  repo: AppRepository,
  env: SuuntoEnv,
  fetcher: FetchLike = fetch,
): Promise<string> {
  const tokens = await repo.getSuuntoTokens();
  if (!tokens) {
    throw new Error('Suunto account not connected');
  }
  if (new Date(tokens.expires_at).getTime() > Date.now()) {
    return tokens.access_token;
  }

  const res = await fetcher('https://cloudapi-oauth.suunto.com/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: buildBasicAuth(env.SUUNTO_CLIENT_ID, env.SUUNTO_CLIENT_SECRET),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Suunto token refresh failed (${res.status})`);
  }
  const refreshed = (await res.json()) as SuuntoOAuthTokenResponse;
  const next = {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || tokens.refresh_token,
    expires_at: new Date(Date.now() + Math.max(60, refreshed.expires_in - 60) * 1000).toISOString(),
  };
  await repo.saveSuuntoTokens(next);
  return next.access_token;
}

/**
 * Archives raw .fit bytes in Cloudflare R2, parses telemetry, and performs a
 * non-destructive upsert into Cloudflare D1.
 */
export async function ingestFitBytes(params: {
  repo: AppRepository;
  bucket: R2Archiver;
  fitBytes: Uint8Array;
  suuntoWorkoutKey?: string | null;
}): Promise<{ diveId: string; created: boolean }> {
  const { repo, bucket, fitBytes, suuntoWorkoutKey = null } = params;
  const parsed = await parseSuuntoFit(fitBytes);
  const r2Key = suuntoWorkoutKey
    ? `suunto/${suuntoWorkoutKey}.fit`
    : `manual/${parsed.fitHash}.fit`;
  await bucket.put(r2Key, fitBytes);
  return repo.upsertFromTelemetry({
    parsed,
    suuntoWorkoutKey,
    fitR2Key: r2Key,
  });
}

/**
 * Synchronizes new dives from Suunto Cloud API without overwriting existing entries.
 */
export async function syncSuuntoWorkouts(params: {
  repo: AppRepository;
  bucket: R2Archiver;
  env: SuuntoEnv;
  workoutKeyFilter?: string;
  fetcher?: FetchLike;
}): Promise<{ imported: number; skipped: number }> {
  const { repo, bucket, env, workoutKeyFilter, fetcher = fetch } = params;
  const accessToken = await getValidSuuntoAccessToken(repo, env, fetcher);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Ocp-Apim-Subscription-Key': env.SUUNTO_SUBSCRIPTION_KEY,
  };

  let keysToCheck: string[] = [];
  if (workoutKeyFilter) {
    keysToCheck = [workoutKeyFilter];
  } else {
    const listRes = await fetcher('https://cloudapi.suunto.com/v3/workouts?limit=50', { headers });
    if (!listRes.ok) {
      throw new Error(`Suunto workouts fetch failed (${listRes.status})`);
    }
    const listJson = (await listRes.json()) as SuuntoWorkoutListResponse;
    keysToCheck = (listJson.payload ?? []).map((w) => w.workoutKey).filter(Boolean);
  }

  let imported = 0;
  let skipped = 0;

  for (const key of keysToCheck) {
    if (await repo.hasWorkoutKey(key)) {
      skipped += 1;
      continue;
    }

    const fitRes = await fetcher(
      `https://cloudapi.suunto.com/v3/workouts/${encodeURIComponent(key)}/fit`,
      { headers },
    );
    if (!fitRes.ok) {
      skipped += 1;
      continue;
    }

    const fitBytes = new Uint8Array(await fitRes.arrayBuffer());
    try {
      const parsed = await parseSuuntoFit(fitBytes);
      // Skip non-diving workouts where maxDepthM === 0 and no depth samples exist
      const hasDepth = parsed.maxDepthM > 0 || parsed.samples.some((s) => s.depthM !== null);
      if (!hasDepth) {
        skipped += 1;
        continue;
      }
      const r2Key = `suunto/${key}.fit`;
      await bucket.put(r2Key, fitBytes);
      const { created } = await repo.upsertFromTelemetry({
        parsed,
        suuntoWorkoutKey: key,
        fitR2Key: r2Key,
      });
      if (created) imported += 1;
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }

  return { imported, skipped };
}
