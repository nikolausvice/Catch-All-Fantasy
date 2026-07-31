declare module "espn-fantasy-football-api/node" {
  interface ClientOptions {
    leagueId: number;
    espnS2?: string;
    SWID?: string;
  }

  interface LeagueInfo {
    leagueId: number;
    seasonId: number;
    name: string;
    size: number;
    isPublic: boolean;
    currentMatchupPeriodId: number;
    currentScoringPeriodId: number;
  }

  interface EspnPlayer {
    id: number;
    fullName: string;
    proTeamAbbreviation: string | null;
    defaultPosition: string | null;
  }

  interface EspnTeam {
    id: number;
    name: string;
    abbreviation: string;
    ownerName: string;
    logoURL: string | null;
    roster: EspnPlayer[];
    wins: number;
    losses: number;
    ties: number;
  }

  /** A player as they appear in a boxscore lineup entry. */
  interface BoxscorePlayer {
    id: number;
    fullName: string;
    /**
     * The lineup slot this player occupies this week, e.g. "QB", "RB", "WR",
     * "TE", "RB/WR/TE", "D/ST", "K", "Bench", "IR".
     */
    rosteredPosition: string;
    /** Actual fantasy points scored this week. */
    totalPoints: number;
  }

  interface EspnBoxscore {
    homeTeamId: number;
    awayTeamId: number | null;
    homeScore: number;
    awayScore: number;
    /**
     * Projected final score for the home team (current + remaining projections).
     * Only populated for the current matchup period.
     */
    homeProjectedScore: number;
    /**
     * Projected final score for the away team.
     * Only populated for the current matchup period.
     */
    awayProjectedScore: number;
    /** Home team's lineup entries in slot order. */
    homeRoster: BoxscorePlayer[];
    /** Away team's lineup entries in slot order. */
    awayRoster: BoxscorePlayer[];
  }

  export class Client {
    constructor(options: ClientOptions);
    setCookies(cookies: { espnS2: string; SWID: string }): void;
    getLeagueInfo(options: { seasonId: number }): Promise<LeagueInfo>;
    getTeamsAtWeek(options: {
      seasonId: number;
      scoringPeriodId: number;
    }): Promise<EspnTeam[]>;
    getBoxscoreForWeek(options: {
      seasonId: number;
      matchupPeriodId: number;
      scoringPeriodId: number;
    }): Promise<EspnBoxscore[]>;
  }
}
