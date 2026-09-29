import type {
  CacheStatus,
  CompareResponse,
  LeagueRefreshResult,
  LineupResponse,
  PlayersRefreshResult,
  PlayerSearchResult,
} from './types';

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5114';

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { signal });

  if (!response.ok) {
    // The API returns a problem+json body when the cache has never been populated.
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

async function post<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { method: 'POST' });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  status: () => get<CacheStatus>('/api/props/status'),

  search: (query: string, signal?: AbortSignal) =>
    get<PlayerSearchResult[]>(`/api/props/search?query=${encodeURIComponent(query)}`, signal),

  compare: (playerIds: string[]) =>
    get<CompareResponse>(`/api/props/compare?players=${playerIds.map(encodeURIComponent).join(',')}`),

  refresh: async (): Promise<CacheStatus> => {
    const response = await fetch(`${BASE}/api/props/refresh`, { method: 'POST' });
    if (!response.ok) throw new Error(`Refresh failed (${response.status})`);
    return response.json();
  },

  lineup: (leagueId: string, rosterId?: number, signal?: AbortSignal) => {
    const query = rosterId === undefined ? '' : `?rosterId=${rosterId}`;
    return get<LineupResponse>(`/api/lineups/${encodeURIComponent(leagueId)}${query}`, signal);
  },

  /** Re-pulls rosters and lineups. Small and free, but always a deliberate click. */
  refreshLeague: (leagueId: string) =>
    post<LeagueRefreshResult>(`/api/lineups/${encodeURIComponent(leagueId)}/refresh`),

  /** Re-downloads Sleeper's 15 MB player list. Only needed for a just-signed player. */
  refreshPlayers: () => post<PlayersRefreshResult>('/api/lineups/players/refresh'),
};
