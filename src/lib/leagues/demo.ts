import type { LeagueMatchup, LeagueTeam } from "./types";

function teamScore(team: LeagueTeam): number {
  return team.players.filter((p) => p.isStarter).reduce((sum, p) => sum + (p.points ?? 0), 0);
}

/**
 * Derives scores from the stored roster's per-player `points` rather than
 * trusting separately-stored aggregate fields, so editing a single player's
 * score through the demo editor is the only thing that needs to change —
 * everything downstream (win probability, sweet spots, similarity) recomputes
 * from the roster automatically.
 *
 * Projected is set equal to actual (not "actual if scored, else pregame
 * projection") — this is a sandbox where you're directly typing in each
 * player's final number, not simulating an in-progress week. Blending in
 * projectedPoints there created a cliff: nudging a player's points up from 0
 * to any small positive value would REPLACE their full projection with that
 * small number, so the team's projected score (and win probability) could
 * drop even though you just raised a score. Keeping them equal makes edits
 * strictly monotonic — raising a player's points never lowers your odds.
 */
export function computeDemoMatchup(stored: LeagueMatchup): LeagueMatchup {
  const myScore = teamScore(stored.team);
  const oppScore = stored.opponent ? teamScore(stored.opponent) : null;
  return {
    ...stored,
    teamScore: myScore,
    opponentScore: oppScore,
    teamProjectedScore: myScore,
    opponentProjectedScore: oppScore ?? undefined,
  };
}
