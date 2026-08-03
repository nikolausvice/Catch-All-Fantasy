import {
  getSleeperLeague,
  getSleeperLeagueRosters,
  getSleeperLeagueUsers,
  getSleeperMatchups,
  getSleeperPlayers,
  getSleeperProjections,
  sleeperAvatarUrl,
} from "@/lib/sleeper/client";
import type { SleeperMatchup, SleeperRoster, SleeperUser } from "@/lib/sleeper/types";
import type { LeagueMatchup, LeagueTeam, LeagueTeamPlayer, LeagueTeamSummary } from "./types";

function rosterTeamName(
  roster: SleeperRoster,
  owner: SleeperUser | undefined,
): string {
  return (
    owner?.metadata?.team_name || owner?.display_name || `Team ${roster.roster_id}`
  );
}

async function getSleeperRosterSummaries(
  leagueId: string,
): Promise<{ rosters: SleeperRoster[]; summaries: LeagueTeamSummary[] }> {
  const [rosters, users] = await Promise.all([
    getSleeperLeagueRosters(leagueId),
    getSleeperLeagueUsers(leagueId),
  ]);

  const usersById = new Map(users.map((user) => [user.user_id, user]));

  const summaries = rosters.map((roster) => {
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    return {
      id: String(roster.roster_id),
      name: rosterTeamName(roster, owner),
      avatarUrl: owner ? sleeperAvatarUrl(owner.avatar) : null,
      wins: roster.settings.wins,
      losses: roster.settings.losses,
      ties: roster.settings.ties,
    };
  });

  return { rosters, summaries };
}

/** Lightweight team list (no rosters/players) for the team picker screen. */
export async function getSleeperTeamSummaries(
  leagueId: string,
): Promise<LeagueTeamSummary[]> {
  const { summaries } = await getSleeperRosterSummaries(leagueId);
  return summaries;
}

/**
 * Sleeper's projections endpoint only exposes canned `pts_ppr`/`pts_half_ppr`/
 * `pts_std` rollups, which don't reflect a league's actual custom scoring
 * settings (bonus thresholds, non-standard TD values, IDP categories, etc.) —
 * using them produced projected totals that were consistently a couple
 * points off from what the league would really award. Instead, compute the
 * projection from the same raw per-stat-category figures Sleeper uses to
 * compute actual scores, weighted by the league's own `scoring_settings` —
 * the same math Sleeper's own scoring engine applies.
 */
function computeProjectedPoints(
  stats: Record<string, number | undefined>,
  scoringSettings: Record<string, number>,
): number | undefined {
  let total = 0;
  let hasAny = false;
  for (const [statKey, weight] of Object.entries(scoringSettings)) {
    const value = stats[statKey];
    if (value === undefined) continue;
    total += value * weight;
    hasAny = true;
  }
  return hasAny ? total : undefined;
}

/**
 * Builds a full LeagueTeam from a Sleeper roster.
 * Starters are returned in slot order (matching league's roster_positions);
 * bench players follow. Points come from matchup data; projections from the
 * weekly projections endpoint.
 */
function buildSleeperTeam({
  roster,
  summary,
  slotPositions,
  playersMap,
  matchup,
  scoringSettings,
  projectionsMap,
}: {
  roster: SleeperRoster;
  summary: LeagueTeamSummary;
  slotPositions: string[];
  playersMap: Awaited<ReturnType<typeof getSleeperPlayers>>;
  matchup: SleeperMatchup | undefined;
  scoringSettings: Record<string, number>;
  projectionsMap: Awaited<ReturnType<typeof getSleeperProjections>>;
}): LeagueTeam {
  const playerPoints = matchup?.players_points ?? {};
  const starterIds = roster.starters ?? [];
  const starterSet = new Set(starterIds);

  function makePlayer(playerId: string, isStarter: boolean, slotIndex?: number): LeagueTeamPlayer {
    const player = playersMap[playerId];
    const pts = playerPoints[playerId];
    const proj = computeProjectedPoints(
      projectionsMap[playerId]?.stats ?? {},
      scoringSettings,
    );
    return {
      id: playerId,
      name:
        player?.full_name ||
        `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim() ||
        playerId,
      position: player?.position ?? null,
      proTeam: player?.team ?? null,
      isStarter,
      slot: slotIndex !== undefined ? (slotPositions[slotIndex] ?? "BN") : "BN",
      points: pts !== undefined ? pts : undefined,
      projectedPoints: proj !== undefined ? proj : undefined,
      isRookie: player?.years_exp != null ? player.years_exp === 0 : undefined,
    };
  }

  const starterPlayers = starterIds.map((pid, i) => makePlayer(pid, true, i));
  const benchPlayers = (roster.players ?? [])
    .filter((pid) => !starterSet.has(pid))
    .map((pid) => makePlayer(pid, false));

  const allPlayers = [...starterPlayers, ...benchPlayers];

  // Compute projected final score per starter as max(pointsSoFar, projection):
  // once a player's actual output passes their pre-game projection, use the
  // actual; otherwise assume they still close the gap to their projection by
  // game end. This handles partial-game scoring correctly — a player at 8
  // actual points with a 14-point projection contributes 14, not 8 (the old
  // "only use the projection if they haven't scored at all" logic dropped
  // their remaining upside the moment they got on the board, which is why
  // projected totals ran a few points low for anyone mid-game).
  let teamProjectedScore: number | undefined;
  const starters = allPlayers.filter((p) => p.isStarter);
  const hasAnyProjection = starters.some((p) => p.projectedPoints !== undefined);
  if (hasAnyProjection) {
    teamProjectedScore = starters.reduce((sum, p) => {
      const scored = p.points ?? 0;
      const projected = p.projectedPoints ?? 0;
      return sum + Math.max(scored, projected);
    }, 0);
  }

  return {
    ...summary,
    players: allPlayers,
    // Store on team so caller can aggregate
    _projectedScore: teamProjectedScore,
  } as LeagueTeam & { _projectedScore?: number };
}

/**
 * The user's own team (full roster, slot-ordered) plus this week's opponent
 * (also full roster). Returns `opponent: null` when the team has a bye.
 * Both teams include per-player actual points, projected points, and the
 * team-level projected final score.
 */
export async function getSleeperTeamMatchup({
  leagueId,
  rosterId,
  week,
}: {
  leagueId: string;
  rosterId: string;
  week: number;
}): Promise<LeagueMatchup> {
  const [{ rosters, summaries }, playersMap, matchups, league] =
    await Promise.all([
      getSleeperRosterSummaries(leagueId),
      getSleeperPlayers(),
      getSleeperMatchups(leagueId, week),
      getSleeperLeague(leagueId),
    ]);

  const projectionsMap = await getSleeperProjections(league.season, week);

  const slotPositions = league.roster_positions;
  const summariesById = new Map(summaries.map((s) => [s.id, s]));
  const rostersById = new Map(rosters.map((r) => [String(r.roster_id), r]));
  const matchupsByRosterId = new Map(
    matchups.map((m) => [String(m.roster_id), m]),
  );

  const myRoster = rostersById.get(rosterId);
  if (!myRoster) {
    throw new Error(`No Sleeper roster ${rosterId} found in league ${leagueId}.`);
  }

  const myMatchup = matchupsByRosterId.get(rosterId);
  const opponentMatchup =
    myMatchup?.matchup_id != null
      ? matchups.find(
          (m) =>
            m.matchup_id === myMatchup.matchup_id &&
            String(m.roster_id) !== rosterId,
        )
      : undefined;

  const buildArgs = {
    slotPositions,
    playersMap,
    scoringSettings: league.scoring_settings,
    projectionsMap,
  };

  const teamBuilt = buildSleeperTeam({
    roster: myRoster,
    summary: summariesById.get(rosterId)!,
    matchup: myMatchup,
    ...buildArgs,
  }) as LeagueTeam & { _projectedScore?: number };

  let opponent: LeagueTeam | null = null;
  let opponentProjectedScore: number | undefined;

  if (opponentMatchup) {
    const oppRosterId = String(opponentMatchup.roster_id);
    const oppRoster = rostersById.get(oppRosterId);
    const oppSummary = summariesById.get(oppRosterId);
    if (oppRoster && oppSummary) {
      const oppBuilt = buildSleeperTeam({
        roster: oppRoster,
        summary: oppSummary,
        matchup: opponentMatchup,
        ...buildArgs,
      }) as LeagueTeam & { _projectedScore?: number };
      opponentProjectedScore = oppBuilt._projectedScore;
      // Strip the internal field before returning
      const { _projectedScore: _opp, ...cleanOpp } = oppBuilt as LeagueTeam & { _projectedScore?: number };
      opponent = cleanOpp as LeagueTeam;
    }
  }

  const { _projectedScore: teamProjectedScore, ...cleanTeam } = teamBuilt;

  return {
    week,
    team: cleanTeam as LeagueTeam,
    opponent,
    teamScore: myMatchup?.points ?? null,
    opponentScore: opponentMatchup?.points ?? null,
    teamProjectedScore,
    opponentProjectedScore,
  };
}
