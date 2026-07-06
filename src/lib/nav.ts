export type ViewKey =
  | 'catalog'
  | 'tournaments'
  | 'daily'
  | 'replays'
  | 'leaderboards'
  | 'bilac'
  | 'myleague';

export const VIEW_PATH: Record<ViewKey, string> = {
  catalog: '/',
  tournaments: '/tournaments',
  daily: '/daily',
  replays: '/replays',
  leaderboards: '/leaderboards',
  bilac: '/bilac',
  myleague: '/myleague',
};

export const PATH_VIEW: Record<string, ViewKey> = Object.fromEntries(
  Object.entries(VIEW_PATH).map(([k, v]) => [v, k as ViewKey]),
) as Record<string, ViewKey>;
