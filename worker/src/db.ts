import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';
import type { MatchDO } from './do/match';
import type { MatchmakingDO } from './do/matchmaking';
import type { GameServerDO } from './do/gameserver';

export type Bindings = {
  DB: D1Database;
  CORS_ORIGIN: string;
  APP_URL: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
  MATCH_DO: DurableObjectNamespace<MatchDO>;
  MATCHMAKING_DO: DurableObjectNamespace<MatchmakingDO>;
  GAMESERVER_DO: DurableObjectNamespace<GameServerDO>;
  GOOGLE_CLIENT_ID?: string;
};

export type Db = ReturnType<typeof createDb>;

export const createDb = (env: Bindings) => drizzle(env.DB, { schema });
