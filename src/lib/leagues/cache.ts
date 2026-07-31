import { unstable_cache } from "next/cache";
import { getEspnTeamMatchup, getEspnTeamSummaries } from "./espn";
import { getSleeperTeamMatchup, getSleeperTeamSummaries } from "./sleeper";

/**
 * These wrap the *composed* results (not just the raw fetch) so that:
 *  - ESPN calls, which go through axios and bypass Next's fetch cache
 *    entirely, get cached at all.
 *  - Sleeper calls skip re-parsing the ~5MB player dictionary on every
 *    request once a result is cached.
 */

export const getCachedSleeperTeamSummaries = unstable_cache(
  (leagueId: string) => getSleeperTeamSummaries(leagueId),
  ["sleeper-team-summaries"],
  { revalidate: 90 },
);

export const getCachedSleeperTeamMatchup = unstable_cache(
  (leagueId: string, rosterId: string, week: number) =>
    getSleeperTeamMatchup({ leagueId, rosterId, week }),
  ["sleeper-team-matchup"],
  { revalidate: 60 },
);

export const getCachedEspnTeamSummaries = unstable_cache(
  (leagueId: number, seasonId: number, espnS2?: string, swid?: string) =>
    getEspnTeamSummaries({ leagueId, seasonId, espnS2, swid }),
  ["espn-team-summaries"],
  { revalidate: 90 },
);

export const getCachedEspnTeamMatchup = unstable_cache(
  (
    leagueId: number,
    seasonId: number,
    teamId: string,
    espnS2?: string,
    swid?: string,
  ) => getEspnTeamMatchup({ leagueId, seasonId, teamId, espnS2, swid }),
  ["espn-team-matchup"],
  { revalidate: 60 },
);
