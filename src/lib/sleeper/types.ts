export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
  /** Only present on /league/{id}/users, not the standalone user lookup. */
  metadata?: {
    team_name?: string;
  } | null;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  sport: string;
  status: string;
  total_rosters: number;
  avatar: string | null;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners: string[] | null;
  league_id: string;
  players: string[] | null;
  starters: string[] | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal: number;
    fpts_against: number;
    fpts_against_decimal: number;
  };
}

export interface SleeperMatchup {
  matchup_id: number | null;
  roster_id: number;
  points: number;
  players: string[];
  starters: string[];
  players_points: Record<string, number>;
  starters_points?: number[];
}

export interface SleeperNflState {
  week: number;
  season: string;
  season_type: "pre" | "regular" | "post";
  display_week: number;
}

/** Keyed by player_id, e.g. sleeperPlayers["4046"] */
export interface SleeperPlayer {
  player_id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  position: string | null;
  team: string | null;
  status: string | null;
}

export type SleeperPlayersMap = Record<string, SleeperPlayer>;
