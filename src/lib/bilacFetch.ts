export type BilacFetchOpts = RequestInit & { tournamentId?: string; tournamentCode?: string; userId?: string };

export async function bilacFetch(url: string, opts: BilacFetchOpts = {}): Promise<Response> {
  const headers = new Headers(opts.headers);
  if (opts.tournamentId) headers.set('x-tournament-id', opts.tournamentId);
  if (opts.tournamentCode) headers.set('x-tournament-code', opts.tournamentCode);
  const userId = opts.userId ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('userId') : null);
  if (userId) headers.set('x-user-id', userId);
  return fetch(url, { ...opts, headers });
}
