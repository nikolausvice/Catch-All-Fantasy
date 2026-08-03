export type GameStatus = "pre" | "in" | "post";

// Abbreviation drift between platforms (and ESPN's own APIs disagreeing with
// themselves over the years) — collapse every variant to one canonical form
// so a Sleeper roster's "WAS" and ESPN's scoreboard "WSH" resolve to the same
// team.
const TEAM_ALIASES: Record<string, string> = {
  WAS: "WSH",
  JAC: "JAX",
  LA: "LAR",
  ARZ: "ARI",
  CLV: "CLE",
  HST: "HOU",
  BLT: "BAL",
  SD: "LAC",
  OAK: "LV",
  STL: "LAR",
};

export function normalizeTeamAbbrev(abbrev: string | null | undefined): string {
  const up = (abbrev ?? "").toUpperCase().trim();
  return TEAM_ALIASES[up] ?? up;
}

interface EspnScoreboardResponse {
  events?: {
    status?: { type?: { state?: string } };
    competitions?: { competitors?: { team?: { abbreviation?: string } }[] }[];
  }[];
}

/**
 * Which NFL teams have started/finished/not-yet-started their game for a
 * given week — straight from ESPN's public scoreboard (no fantasy-league
 * cookies needed; this is just the real-world schedule). A team absent from
 * the result is on a bye that week.
 *
 * This exists because 0 fantasy points looks identical whether a player
 * hasn't played yet or has already played and scored nothing — the box
 * score alone can't tell those apart, but the real game clock can.
 */
export async function getNflGameStatuses(
  season: number,
  week: number,
): Promise<Map<string, GameStatus>> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?year=${season}&seasontype=2&week=${week}`;

  let data: EspnScoreboardResponse;
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return new Map();
    data = await res.json();
  } catch {
    return new Map();
  }

  const statuses = new Map<string, GameStatus>();
  for (const event of data.events ?? []) {
    const state = event.status?.type?.state;
    if (state !== "pre" && state !== "in" && state !== "post") continue;
    for (const competitor of event.competitions?.[0]?.competitors ?? []) {
      const abbrev = competitor.team?.abbreviation;
      if (abbrev) statuses.set(normalizeTeamAbbrev(abbrev), state);
    }
  }
  return statuses;
}
