export interface LeagueTeamPlayer {
  id: string;
  name: string;
  position: string | null;
  proTeam: string | null;
  isStarter: boolean;
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
  opponent: LeagueTeamSummary | null;
  teamScore: number | null;
  opponentScore: number | null;
}
