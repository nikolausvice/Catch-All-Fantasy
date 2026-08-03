import { Client } from "espn-fantasy-football-api/node";

export class EspnApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "EspnApiError";
  }
}

export interface EspnLeagueSummary {
  leagueId: number;
  seasonId: number;
  name: string;
  size: number;
  isPublic: boolean;
  currentScoringPeriodId: number;
}

export interface EspnTeamSummary {
  id: number;
  name: string;
  ownerName: string;
  logoURL: string | null;
  wins: number;
  losses: number;
  ties: number;
  roster: {
    id: number;
    fullName: string;
    proTeamAbbreviation: string | null;
    defaultPosition: string | null;
  }[];
}

/**
 * Fetches league name/size/visibility for a given ESPN fantasy football
 * league + season. Cookies are only required for private leagues (the
 * default for most leagues since ESPN locked them down a few years ago).
 */
export async function getEspnLeagueInfo({
  leagueId,
  seasonId,
  espnS2,
  swid,
}: {
  leagueId: number;
  seasonId: number;
  espnS2?: string;
  swid?: string;
}): Promise<EspnLeagueSummary> {
  const client = buildClient({ leagueId, espnS2, swid });

  try {
    const league = await client.getLeagueInfo({ seasonId });
    return {
      leagueId,
      seasonId,
      name: league.name,
      size: league.size,
      isPublic: league.isPublic,
      currentScoringPeriodId: league.currentScoringPeriodId,
    };
  } catch (err) {
    throw toEspnApiError(err, leagueId, seasonId);
  }
}

/** Fetches every team in the league, with full rosters, for a given week. */
export async function getEspnLeagueTeams({
  leagueId,
  seasonId,
  scoringPeriodId,
  espnS2,
  swid,
}: {
  leagueId: number;
  seasonId: number;
  scoringPeriodId: number;
  espnS2?: string;
  swid?: string;
}): Promise<EspnTeamSummary[]> {
  const client = buildClient({ leagueId, espnS2, swid });

  try {
    const teams = await client.getTeamsAtWeek({
      seasonId,
      scoringPeriodId: Number.isFinite(scoringPeriodId) && scoringPeriodId > 0
        ? scoringPeriodId
        : 1,
    });
    return teams.map((team) => ({
      id: team.id,
      name: team.name || team.abbreviation,
      ownerName: team.ownerName,
      logoURL: team.logoURL || null,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      roster: team.roster.map((player) => ({
        id: player.id,
        fullName: player.fullName,
        proTeamAbbreviation: player.proTeamAbbreviation,
        defaultPosition: player.defaultPosition,
      })),
    }));
  } catch (err) {
    throw toEspnApiError(err, leagueId, seasonId);
  }
}

export interface EspnBoxscorePlayer {
  id: number;
  fullName: string;
  rosteredPosition: string;
  totalPoints: number;
  /** Sum of the per-category projected breakdown; undefined if ESPN didn't return one. */
  projectedPoints?: number;
}

/** A stat-category → points breakdown sums to the player's total for that source. */
function sumProjectedPoints(breakdown: Record<string, number> | undefined): number | undefined {
  if (!breakdown) return undefined;
  const values = Object.values(breakdown).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0);
}

export interface EspnBoxscoreSummary {
  homeTeamId: number;
  awayTeamId: number | null;
  homeScore: number;
  awayScore: number;
  homeProjectedScore: number | null;
  awayProjectedScore: number | null;
  homeRoster: EspnBoxscorePlayer[];
  awayRoster: EspnBoxscorePlayer[];
}

/** Fetches every matchup (boxscore) in the league for a given week. */
export async function getEspnBoxscoresForWeek({
  leagueId,
  seasonId,
  matchupPeriodId,
  scoringPeriodId,
  espnS2,
  swid,
}: {
  leagueId: number;
  seasonId: number;
  matchupPeriodId: number;
  scoringPeriodId: number;
  espnS2?: string;
  swid?: string;
}): Promise<EspnBoxscoreSummary[]> {
  const client = buildClient({ leagueId, espnS2, swid });

  try {
    const boxes = await client.getBoxscoreForWeek({
      seasonId,
      matchupPeriodId,
      scoringPeriodId,
    });

    function mapRoster(roster: import("espn-fantasy-football-api/node").BoxscorePlayer[]): EspnBoxscorePlayer[] {
      return (roster ?? []).map((p) => ({
        id: p.id,
        fullName: p.fullName,
        rosteredPosition: p.rosteredPosition,
        totalPoints: p.totalPoints ?? 0,
        projectedPoints: sumProjectedPoints(p.projectedPointBreakdown),
      }));
    }

    return boxes.map((box) => ({
      homeTeamId: box.homeTeamId,
      awayTeamId: box.awayTeamId ?? null,
      homeScore: box.homeScore,
      awayScore: box.awayScore,
      homeProjectedScore: box.homeProjectedScore ?? null,
      awayProjectedScore: box.awayProjectedScore ?? null,
      homeRoster: mapRoster(box.homeRoster ?? []),
      awayRoster: mapRoster(box.awayRoster ?? []),
    }));
  } catch (err) {
    throw toEspnApiError(err, leagueId, seasonId);
  }
}

export interface EspnDiscoveredLeague {
  leagueId: number;
  seasonId: number;
  name: string;
}

/**
 * ESPN's fan API returns every fantasy entry tied to the logged-in account's
 * cookies, across seasons — no leagueId needed up front. This is an
 * undocumented endpoint (reverse-engineered from ESPN's own fantasy site
 * traffic), so we parse defensively and surface a clear error if ESPN ever
 * changes the response shape.
 *
 * Fantasy entries are marked by `typeId: 9` ("Fantasy League Manager") at
 * the preference level; `metaData.entry.abbrev` distinguishes the sport
 * within that ("FFL" = football, as opposed to e.g. "FBB" for baseball).
 * `metaData.entry.gameId` is a numeric internal id, NOT the "ffl" slug used
 * elsewhere in ESPN's API — don't filter on it.
 */
export async function getEspnLeaguesForCookies({
  espnS2,
  swid,
}: {
  espnS2: string;
  swid: string;
}): Promise<EspnDiscoveredLeague[]> {
  const normalizedSwid = swid.startsWith("{") ? swid : `{${swid.replace(/[{}]/g, "")}}`;
  const url = `https://fan.api.espn.com/apis/v2/fans/${encodeURIComponent(
    normalizedSwid,
  )}?platform=fantasy&featureFlags=expandedLeagueGroupResponse&lang=en`;

  const res = await fetch(url, {
    headers: {
      Cookie: `espn_s2=${espnS2}; SWID=${normalizedSwid};`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    throw new EspnApiError(
      "ESPN rejected those credentials. Double-check the espn_s2 and SWID cookies.",
      res.status,
    );
  }
  if (!res.ok) {
    throw new EspnApiError(
      `ESPN returned an unexpected error while looking up leagues (HTTP ${res.status}).`,
      res.status,
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new EspnApiError("ESPN returned an unexpected response while looking up leagues.", 0);
  }

  const preferences = (data as { preferences?: unknown[] } | null)?.preferences;
  if (!Array.isArray(preferences)) {
    throw new EspnApiError("ESPN returned an unexpected response while looking up leagues.", 0);
  }

  // The account can have multiple teams in the same league (e.g. it owns
  // several teams in a test league) and the same league can appear once per
  // season played — keep only the most recent season per league so "find
  // leagues" reflects the league the user is in *now*.
  const byLeagueId = new Map<number, EspnDiscoveredLeague>();
  for (const pref of preferences) {
    const p = pref as {
      typeId?: number;
      metaData?: {
        entry?: {
          abbrev?: string;
          seasonId?: number;
          groups?: { groupId?: number; groupName?: string }[];
        };
      };
    };
    if (p.typeId !== 9) continue;
    const entry = p.metaData?.entry;
    if (!entry || entry.abbrev !== "FFL") continue;

    const group = entry.groups?.[0];
    const groupId = group?.groupId;
    const seasonId = entry.seasonId;
    if (!groupId || !seasonId) continue;

    const existing = byLeagueId.get(groupId);
    if (!existing || seasonId > existing.seasonId) {
      byLeagueId.set(groupId, {
        leagueId: groupId,
        seasonId,
        name: group?.groupName ?? `League ${groupId}`,
      });
    }
  }

  return [...byLeagueId.values()];
}

function buildClient({
  leagueId,
  espnS2,
  swid,
}: {
  leagueId: number;
  espnS2?: string;
  swid?: string;
}): Client {
  return new Client({
    leagueId,
    ...(espnS2 && swid ? { espnS2, SWID: swid } : {}),
  });
}

function toEspnApiError(
  err: unknown,
  leagueId: number,
  seasonId: number,
): EspnApiError {
  const status = getAxiosStatus(err);
  if (status === 401 || status === 403) {
    return new EspnApiError(
      "ESPN rejected those credentials. Double-check the espn_s2 and SWID cookies.",
      status,
    );
  }
  if (status === 404) {
    return new EspnApiError(
      `No ESPN league found with id ${leagueId} for ${seasonId}.`,
      404,
    );
  }
  if (!status) {
    // Non-HTTP error — ESPN's API returned unexpected data or the package
    // couldn't parse the response. Common cause: league hasn't drafted yet
    // or the season hasn't started, so rosters/matchups don't exist.
    return new EspnApiError(
      "Couldn't load data from ESPN — the league may not have drafted yet, or the season hasn't started.",
      0,
    );
  }
  return new EspnApiError(
    `ESPN returned an unexpected error (HTTP ${status}).`,
    status,
  );
}

function getAxiosStatus(err: unknown): number | undefined {
  if (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof (err as { response?: { status?: number } }).response === "object"
  ) {
    return (err as { response?: { status?: number } }).response?.status;
  }
  return undefined;
}
