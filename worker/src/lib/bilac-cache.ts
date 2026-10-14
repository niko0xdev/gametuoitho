import type { MiddlewareHandler } from 'hono';

export const bilacNoStore: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('Cache-Control', 'private, no-store, max-age=0');
};
