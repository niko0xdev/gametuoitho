import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export type Bindings = {
  DB: D1Database;
  CORS_ORIGIN: string;
  APP_URL: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
};

export type Db = ReturnType<typeof createDb>;

export const createDb = (env: Bindings) => drizzle(env.DB, { schema });
