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

  export class Client {
    constructor(options: ClientOptions);
    setCookies(cookies: { espnS2: string; SWID: string }): void;
    getLeagueInfo(options: { seasonId: number }): Promise<LeagueInfo>;
  }
}
