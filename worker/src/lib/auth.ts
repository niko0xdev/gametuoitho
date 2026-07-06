import type { MiddlewareHandler } from 'hono';
import { eq } from 'drizzle-orm';
import type { Bindings } from '../db';
import { createDb } from '../db';
import { usersTable } from '../schema';

declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
    userRole: 'admin' | 'user';
  }
}

export const requireLoggedIn = (): MiddlewareHandler<{ Bindings: Bindings }> => {
  return async (c, next) => {
    const userId = c.req.header('x-user-id');
    if (!userId) {
      return c.json({ error: 'Thiếu mã đăng nhập (x-user-id header)!' }, 401);
    }
    const db = createDb(c.env);
    const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).all();
    if (!rows[0]) {
      return c.json({ error: 'Người dùng không tồn tại!' }, 401);
    }
    c.set('userId', userId);
    c.set('userRole', rows[0].role);
    await next();
  };
};

export const requireAdmin = (): MiddlewareHandler<{ Bindings: Bindings }> => {
  return async (c, next) => {
    const role = c.get('userRole');
    if (role !== 'admin') {
      return c.json({ error: 'Yêu cầu quyền quản trị viên!' }, 403);
    }
    await next();
  };
};