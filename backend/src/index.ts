export interface Env {
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
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};
