import { createD1AuthRepository } from './db/authRepo';
import { createD1Repository } from './db/repository';
import { type FullBackendEnv, handleApiRoutes } from './routes/api';
import { handleAuthRoutes } from './routes/auth';

export interface Env extends FullBackendEnv {
  DB: D1Database;
  FIT_BUCKET: R2Bucket;
  ENVIRONMENT: string;
}

function applyApiHeaders(
  response: Response,
  requestOrigin: string | null,
  allowedOrigin: string | undefined,
  isPrivateApi: boolean,
): Response {
  const headers = new Headers(response.headers);
  if (isPrivateApi) {
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    headers.set('Pragma', 'no-cache');
  }

  const originToAllow =
    requestOrigin &&
    (requestOrigin === allowedOrigin || requestOrigin === 'http://localhost:5173')
      ? requestOrigin
      : null;
  if (originToAllow) {
    headers.set('Access-Control-Allow-Origin', originToAllow);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const reqOrigin = request.headers.get('Origin');
    if (request.method === 'OPTIONS') {
      return applyApiHeaders(new Response(null, { status: 204 }), reqOrigin, env.APP_ORIGIN, false);
    }

    const url = new URL(request.url);
    let response: Response | null = null;
    const isHealth = url.pathname === '/api/health';

    if (isHealth) {
      response = Response.json({
        ok: true,
        service: 'diving-app-api',
        environment: env.ENVIRONMENT,
      });
    } else if (url.pathname.startsWith('/api/auth/')) {
      const authRepo = createD1AuthRepository(env.DB);
      response = await handleAuthRoutes(request, env, authRepo);
    } else if (url.pathname.startsWith('/api/')) {
      const repo = createD1Repository(env.DB);
      response = await handleApiRoutes({
        request,
        env,
        repo,
        bucket: env.FIT_BUCKET,
      });
    }

    if (!response) {
      response = Response.json({ error: 'Not found' }, { status: 404 });
    }
    return applyApiHeaders(response, reqOrigin, env.APP_ORIGIN, !isHealth);
  },
};
