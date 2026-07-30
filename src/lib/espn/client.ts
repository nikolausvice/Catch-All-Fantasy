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
  return new EspnApiError("Failed to reach ESPN's API.", status ?? 0);
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
