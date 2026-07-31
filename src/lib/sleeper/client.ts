import type {
  SleeperLeague,
  SleeperMatchup,
  SleeperNflState,
  SleeperPlayersMap,
  SleeperProjection,
  SleeperProjectionsMap,
  SleeperRoster,
  SleeperUser,
} from "./types";

const BASE_URL = "https://api.sleeper.app/v1";
// Projections live outside the /v1 namespace and are shaped differently
// (an array of per-player entries) from every other Sleeper endpoint.
const PROJECTIONS_BASE_URL = "https://api.sleeper.app";

class SleeperApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "SleeperApiError";
  }
}

async function sleeperFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);

  if (res.status === 404) {
    throw new SleeperApiError(`Not found: ${path}`, 404);
  }
  if (!res.ok) {
    throw new SleeperApiError(
      `Sleeper API request failed (${res.status}): ${path}`,
      res.status,
    );
  }

  return res.json() as Promise<T>;
}

/** Looks up a Sleeper account by username. Returns null if no such user exists. */
export async function getSleeperUserByUsername(
  username: string,
): Promise<SleeperUser | null> {
  try {
    return await sleeperFetch<SleeperUser>(
      `/user/${encodeURIComponent(username)}`,
      { cache: "no-store" },
    );
  } catch (err) {
    if (err instanceof SleeperApiError && err.status === 404) return null;
    throw err;
  }
}

export async function getSleeperLeaguesForUser(
  sleeperUserId: string,
  season: string,
  sport: "nfl" = "nfl",
): Promise<SleeperLeague[]> {
  return sleeperFetch<SleeperLeague[]>(
    `/user/${sleeperUserId}/leagues/${sport}/${season}`,
    { cache: "no-store" },
  );
}

export async function getSleeperLeague(leagueId: string): Promise<SleeperLeague> {
  return sleeperFetch<SleeperLeague>(`/league/${leagueId}`, {
    next: { revalidate: 300 },
  });
}

export async function getSleeperLeagueRosters(
  leagueId: string,
): Promise<SleeperRoster[]> {
  return sleeperFetch<SleeperRoster[]>(`/league/${leagueId}/rosters`, {
    next: { revalidate: 60 },
  });
}

export async function getSleeperLeagueUsers(
  leagueId: string,
): Promise<SleeperUser[]> {
  return sleeperFetch<SleeperUser[]>(`/league/${leagueId}/users`, {
    next: { revalidate: 300 },
  });
}

export async function getSleeperMatchups(
  leagueId: string,
  week: number,
): Promise<SleeperMatchup[]> {
  return sleeperFetch<SleeperMatchup[]>(
    `/league/${leagueId}/matchups/${week}`,
    { next: { revalidate: 60 } },
  );
}

export async function getSleeperNflState(): Promise<SleeperNflState> {
  return sleeperFetch<SleeperNflState>("/state/nfl", {
    next: { revalidate: 3600 },
  });
}

/**
 * Per-player projections for a given week (~2MB). Cached for 30 min since
 * projections can update during game days but don't change every minute.
 */
export async function getSleeperProjections(
  year: string,
  week: number,
): Promise<SleeperProjectionsMap> {
  const res = await fetch(
    `${PROJECTIONS_BASE_URL}/projections/nfl/${year}/${week}?season_type=regular`,
    { next: { revalidate: 1800 } },
  );

  if (!res.ok) {
    throw new SleeperApiError(
      `Sleeper API request failed (${res.status}): /projections/nfl/${year}/${week}`,
      res.status,
    );
  }

  const entries = (await res.json()) as SleeperProjection[];
  const map: SleeperProjectionsMap = {};
  for (const entry of entries) {
    map[entry.player_id] = entry;
  }
  return map;
}

/**
 * Full player dictionary (~5MB). Sleeper asks that this only be called
 * a few times a day, so it's cached for 12h at the fetch layer.
 */
export async function getSleeperPlayers(
  sport: "nfl" = "nfl",
): Promise<SleeperPlayersMap> {
  return sleeperFetch<SleeperPlayersMap>(`/players/${sport}`, {
    next: { revalidate: 43200 },
  });
}

export function sleeperAvatarUrl(avatarId: string | null): string | null {
  if (!avatarId) return null;
  return `https://sleepercdn.com/avatars/thumbs/${avatarId}`;
}

export { SleeperApiError };
