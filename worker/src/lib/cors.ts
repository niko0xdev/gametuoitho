import type { MiddlewareHandler } from 'hono';
import type { Bindings } from '../db';

export const cors = (): MiddlewareHandler<{ Bindings: Bindings }> => {
  return async (c, next) => {
    const origin = c.env.CORS_ORIGIN;
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    c.header(
      'Access-Control-Allow-Headers',
      'Content-Type,x-user-id,x-tournament-id,x-tournament-code'
    );
    if (c.req.method === 'OPTIONS') return new Response(null, { status: 204 });
    await next();
  };
};
