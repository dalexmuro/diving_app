import { createD1AuthRepository } from './db/authRepo';
import { type AuthEnv } from './middleware/auth';
import { handleAuthRoutes } from './routes/auth';

export interface Env extends AuthEnv {
  DB: D1Database;
  FIT_BUCKET: R2Bucket;
  ENVIRONMENT: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({
        ok: true,
        service: 'diving-app-api',
        environment: env.ENVIRONMENT,
      });
    }

    if (url.pathname.startsWith('/api/auth/')) {
      const authRepo = createD1AuthRepository(env.DB);
      const authResponse = await handleAuthRoutes(request, env, authRepo);
      if (authResponse) return authResponse;
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};
