import {
  getEspnBoxscoresForWeek,
  getEspnLeagueInfo,
  getEspnLeagueTeams,
  type EspnBoxscorePlayer,
} from "@/lib/espn/client";
import type { LeagueMatchup, LeagueTeam, LeagueTeamPlayer, LeagueTeamSummary } from "./types";

interface EspnCreds {
  leagueId: number;
  seasonId: number;
  espnS2?: string;
  swid?: string;
}

/** Lineup slots that mean "not in active lineup". */
const BENCH_SLOTS = new Set(["Bench", "IR", "INVALID_CODE"]);

const SLOT_ORDER: Record<string, number> = {
  QB: 0, TQB: 1, RB: 2, WR: 3, "RB/WR": 4, TE: 5, "WR/TE": 6,
  "RB/WR/TE": 7, FLEX: 7, OP: 8, "D/ST": 9, K: 10, P: 11, HC: 12,
};

/**
 * Builds a LeagueTeam from the boxscore roster for a given ESPN team.
 * The boxscore roster is slot-ordered (home/awayRoster array order = lineup
 * order), so we preserve that order: starters first, bench after.
 * We cross-reference the team's detailed player list for proTeam/defaultPosition.
 */
function buildEspnTeamFromBoxscore(
  teamId: number,
  boxscoreRoster: EspnBoxscorePlayer[],
  teamSummary: { id: string; name: string; avatarUrl: string | null; wins: number; losses: number; ties: number },
  playerDetails: Map<number, { proTeam: string | null; defaultPosition: string | null }>,
): LeagueTeam {
  const starters: LeagueTeamPlayer[] = [];
  const bench: LeagueTeamPlayer[] = [];
  const starterOriginalIndex = new Map<string, number>();

  for (const p of boxscoreRoster) {
    const slot = p.rosteredPosition ?? "";
    const isBench = BENCH_SLOTS.has(slot);
    const details = playerDetails.get(p.id);
    const entry: LeagueTeamPlayer = {
      id: String(p.id),
      name: p.fullName,
      position: details?.defaultPosition ?? null,
      proTeam: details?.proTeam ?? null,
      isStarter: !isBench,
      slot: slot || undefined,
      points: p.totalPoints,
      projectedPoints: p.projectedPoints,
    };
    if (isBench) {
      bench.push(entry);
    } else {
      starterOriginalIndex.set(String(p.id), starters.length);
      starters.push(entry);
    }
  }

  starters.sort((a, b) => {
    const aOrder = SLOT_ORDER[a.slot ?? ""] ?? 98;
    const bOrder = SLOT_ORDER[b.slot ?? ""] ?? 98;
    if (aOrder !== bOrder) return aOrder - bOrder;
    // Stable tie-break: preserve the original boxscore order within the same slot
    return (starterOriginalIndex.get(a.id) ?? 0) - (starterOriginalIndex.get(b.id) ?? 0);
  });

  return {
    ...teamSummary,
    players: [...starters, ...bench],
  };
}

/** Lightweight team list (no rosters) for the team picker screen. */
export async function getEspnTeamSummaries(
  creds: EspnCreds,
): Promise<LeagueTeamSummary[]> {
  const league = await getEspnLeagueInfo(creds);
  const teams = await getEspnLeagueTeams({
    ...creds,
    scoringPeriodId: league.currentScoringPeriodId,
  });
  return teams.map((team) => ({
    id: String(team.id),
    name: team.name || team.ownerName,
    avatarUrl: team.logoURL,
    wins: team.wins,
    losses: team.losses,
    ties: team.ties,
  }));
}

/**
 * The user's own team (full roster, slot-ordered from boxscore) plus this
 * week's opponent. Returns `opponent: null` when the team has a bye.
 */
export async function getEspnTeamMatchup({
  leagueId,
  seasonId,
  teamId,
  espnS2,
  swid,
}: EspnCreds & { teamId: string }): Promise<LeagueMatchup> {
  const league = await getEspnLeagueInfo({ leagueId, seasonId, espnS2, swid });
  const period = league.currentScoringPeriodId;

  const [rawTeams, boxscores] = await Promise.all([
    getEspnLeagueTeams({ leagueId, seasonId, scoringPeriodId: period, espnS2, swid }),
    getEspnBoxscoresForWeek({
      leagueId,
      seasonId,
      matchupPeriodId: period,
      scoringPeriodId: period,
      espnS2,
      swid,
    }),
  ]);

  // Build a lookup: ESPN player id → {proTeam, defaultPosition}
  const playerDetails = new Map<number, { proTeam: string | null; defaultPosition: string | null }>();
  for (const team of rawTeams) {
    for (const player of team.roster) {
      playerDetails.set(player.id, {
        proTeam: player.proTeamAbbreviation,
        defaultPosition: player.defaultPosition,
      });
    }
  }

  // Build team summaries (no rosters) for wins/losses/name/avatar
  const teamSummaries = new Map(
    rawTeams.map((t) => [
      t.id,
      {
        id: String(t.id),
        name: t.name || t.ownerName,
        avatarUrl: t.logoURL,
        wins: t.wins,
        losses: t.losses,
        ties: t.ties,
      },
    ]),
  );

  const numericTeamId = Number(teamId);
  const box = boxscores.find(
    (b) => b.homeTeamId === numericTeamId || b.awayTeamId === numericTeamId,
  );

  if (!box) {
    // Bye week — no boxscore exists this week, so there's no way to recover
    // which slot each player actually started in. Best we can do is present
    // the roster in the league's normal position order (QB, RB, WR, TE,
    // FLEX, D/ST, K, ...) instead of whatever arbitrary order the season
    // roster endpoint happens to return, so it doesn't look shuffled.
    const summary = teamSummaries.get(numericTeamId);
    if (!summary) throw new Error(`No ESPN team ${teamId} found in league ${leagueId}.`);
    const raw = rawTeams.find((t) => t.id === numericTeamId);
    const players = (raw?.roster ?? [])
      .map((p) => ({
        id: String(p.id),
        name: p.fullName,
        position: p.defaultPosition,
        proTeam: p.proTeamAbbreviation,
        isStarter: false,
      }))
      .sort(
        (a, b) =>
          (SLOT_ORDER[a.position ?? ""] ?? 98) - (SLOT_ORDER[b.position ?? ""] ?? 98),
      );
    const team: LeagueTeam = { ...summary, players };
    return { week: period, team, opponent: null, teamScore: null, opponentScore: null };
  }

  const isHome = box.homeTeamId === numericTeamId;
  const myRoster = isHome ? box.homeRoster : (box.awayRoster ?? []);
  const oppRoster = isHome ? (box.awayRoster ?? []) : box.homeRoster;
  const teamScore = isHome ? box.homeScore : box.awayScore;
  const opponentScore = isHome ? box.awayScore : box.homeScore;
  const opponentId = isHome ? box.awayTeamId : box.homeTeamId;

  const mySummary = teamSummaries.get(numericTeamId);
  if (!mySummary) throw new Error(`No ESPN team ${teamId} found in league ${leagueId}.`);

  const team = buildEspnTeamFromBoxscore(numericTeamId, myRoster, mySummary, playerDetails);

  let opponent: LeagueTeam | null = null;
  if (opponentId != null) {
    const oppSummary = teamSummaries.get(opponentId);
    if (oppSummary) {
      opponent = buildEspnTeamFromBoxscore(opponentId, oppRoster, oppSummary, playerDetails);
    }
  }

  const teamProjectedScore = isHome
    ? (box.homeProjectedScore ?? undefined)
    : (box.awayProjectedScore ?? undefined);
  const opponentProjectedScore = isHome
    ? (box.awayProjectedScore ?? undefined)
    : (box.homeProjectedScore ?? undefined);

  return {
    week: period,
    team,
    opponent,
    teamScore,
    opponentScore,
    teamProjectedScore: teamProjectedScore != null && teamProjectedScore > 0
      ? teamProjectedScore
      : undefined,
    opponentProjectedScore: opponentProjectedScore != null && opponentProjectedScore > 0
      ? opponentProjectedScore
      : undefined,
  };
}
