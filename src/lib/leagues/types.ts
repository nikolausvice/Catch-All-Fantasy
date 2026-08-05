import type { GameStatus } from "./nfl-schedule";

export interface LeagueTeamPlayer {
  id: string;
  name: string;
  position: string | null;
  proTeam: string | null;
  isStarter: boolean;
  /** Lineup slot label, e.g. "QB", "FLEX", "BN". Undefined if platform doesn't expose it. */
  slot?: string;
  /** Actual points scored this week. Undefined if not yet available. */
  points?: number;
  /**
   * Projected points for the full week. For starters with 0 current points
   * this indicates the player hasn't yet played and is still projected to score.
   */
  projectedPoints?: number;
  /** True/false when the platform exposes experience data (currently Sleeper only); undefined = unknown. */
  isRookie?: boolean;
  /**
   * Explicit override of whether this player's game is pre/in/post — set by
   * hand in the demo editor so a demo scenario can be constructed directly
   * (e.g. "has points but game still in progress", or "zero points but
   * done playing") instead of only ever being inferred from the zero-points
   * proxy. Undefined means no override; real platforms never set this —
   * they're inferred from the live NFL schedule instead (see
   * isRemaining/isNotYetStarted in cross-league.ts).
   */
  gameStatus?: GameStatus;
}

export interface LeagueTeam {
  /** Platform-specific id (Sleeper roster_id, ESPN team id), always as a string. */
  id: string;
  name: string;
  avatarUrl: string | null;
  wins: number;
  losses: number;
  ties: number;
  players: LeagueTeamPlayer[];
}

/** Lightweight team info (no roster) for the team picker screen. */
export interface LeagueTeamSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  wins: number;
  losses: number;
  ties: number;
}

export interface LeagueMatchup {
  week: number;
  /** The user's own team, with full roster. */
  team: LeagueTeam;
  /** null if the team has a bye this week. */
  opponent: LeagueTeam | null;
  teamScore: number | null;
  opponentScore: number | null;
  /**
   * Projected final score for your team (current points + remaining starter
   * projections). Populated when at least one platform provides projections.
   */
  teamProjectedScore?: number;
  /** Projected final score for the opponent. */
  opponentProjectedScore?: number;
}
