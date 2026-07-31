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

  interface EspnBoxscore {
    homeTeamId: number;
    awayTeamId: number | null;
    homeScore: number;
    awayScore: number;
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
