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
  const client = new Client({
    leagueId,
    ...(espnS2 && swid ? { espnS2, SWID: swid } : {}),
  });

  try {
    const league = await client.getLeagueInfo({ seasonId });
    return {
      leagueId,
      seasonId,
      name: league.name,
      size: league.size,
      isPublic: league.isPublic,
    };
  } catch (err) {
    const status = getAxiosStatus(err);
    if (status === 401 || status === 403) {
      throw new EspnApiError(
        "ESPN rejected those credentials. Double-check the espn_s2 and SWID cookies.",
        status,
      );
    }
    if (status === 404) {
      throw new EspnApiError(
        `No ESPN league found with id ${leagueId} for ${seasonId}.`,
        404,
      );
    }
    throw new EspnApiError("Failed to reach ESPN's API.", status ?? 0);
  }
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
