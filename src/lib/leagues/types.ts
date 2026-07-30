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
