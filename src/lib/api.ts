const BASE = import.meta.env.VITE_API_BASE as string;

function currentUserId(): string | null {
  // App.tsx stores userId under key 'auth_userId'. Single source of truth.
  return localStorage.getItem('auth_userId');
}

export type ApiOptions = RequestInit & {
  tournamentId?: string;
  tournamentCode?: string;
};

export async function api<T = unknown>(path: string, init: ApiOptions = {}): Promise<T> {
  const { tournamentId, tournamentCode, headers: initHeaders, ...rest } = init;
  const userId = currentUserId();
  const headers = new Headers(initHeaders);
  headers.set('Content-Type', 'application/json');
  if (userId) headers.set('x-user-id', userId);
  if (tournamentId) headers.set('x-tournament-id', tournamentId);
  if (tournamentCode) headers.set('x-tournament-code', tournamentCode);

  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export function bilacFetch<T = unknown>(path: string, init: ApiOptions = {}): Promise<T> {
  // Tournament id/code must be passed by the caller.
  return api<T>(path, init);
}