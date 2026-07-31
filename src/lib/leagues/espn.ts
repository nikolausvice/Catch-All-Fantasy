import {
  getEspnBoxscoresForWeek,
  getEspnLeagueInfo,
  getEspnLeagueTeams,
} from "@/lib/espn/client";
import type { LeagueMatchup, LeagueTeam, LeagueTeamSummary } from "./types";

interface EspnCreds {
  leagueId: number;
  seasonId: number;
  espnS2?: string;
  swid?: string;
}

export async function getEspnLeagueTeamsUnified({
  leagueId,
  seasonId,
  espnS2,
  swid,
}: EspnCreds): Promise<LeagueTeam[]> {
  const league = await getEspnLeagueInfo({ leagueId, seasonId, espnS2, swid });
  const teams = await getEspnLeagueTeams({
    leagueId,
    seasonId,
    scoringPeriodId: league.currentScoringPeriodId,
    espnS2,
    swid,
  });

  return teams.map((team) => ({
    id: String(team.id),
    name: team.name || team.ownerName,
    avatarUrl: team.logoURL,
    wins: team.wins,
    losses: team.losses,
    ties: team.ties,
    players: team.roster.map((player) => ({
      id: String(player.id),
      name: player.fullName,
      position: player.defaultPosition,
      proTeam: player.proTeamAbbreviation,
      isStarter: false,
    })),
  }));
}

/** Lightweight team list (no rosters) for the team picker screen. */
export async function getEspnTeamSummaries(
  creds: EspnCreds,
): Promise<LeagueTeamSummary[]> {
  const teams = await getEspnLeagueTeamsUnified(creds);
  return teams.map(({ id, name, avatarUrl, wins, losses, ties }) => ({
    id,
    name,
    avatarUrl,
    wins,
    losses,
    ties,
  }));
}

/**
 * The user's own team (full roster) plus this week's opponent. Returns
 * `opponent: null` when the team has a bye.
 */
export async function getEspnTeamMatchup({
  leagueId,
  seasonId,
  teamId,
  espnS2,
  swid,
}: EspnCreds & { teamId: string }): Promise<LeagueMatchup> {
  const league = await getEspnLeagueInfo({ leagueId, seasonId, espnS2, swid });
  const [teams, boxscores] = await Promise.all([
    getEspnLeagueTeamsUnified({ leagueId, seasonId, espnS2, swid }),
    getEspnBoxscoresForWeek({
      leagueId,
      seasonId,
      matchupPeriodId: league.currentScoringPeriodId,
      scoringPeriodId: league.currentScoringPeriodId,
      espnS2,
      swid,
    }),
  ]);

  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const team = teamsById.get(teamId);
  if (!team) {
    throw new Error(`No ESPN team ${teamId} found in league ${leagueId}.`);
  }

  const numericTeamId = Number(teamId);
  const box = boxscores.find(
    (b) => b.homeTeamId === numericTeamId || b.awayTeamId === numericTeamId,
  );

  let opponentId: number | null = null;
  let teamScore: number | null = null;
  let opponentScore: number | null = null;

  if (box) {
    const isHome = box.homeTeamId === numericTeamId;
    opponentId = isHome ? box.awayTeamId : box.homeTeamId;
    teamScore = isHome ? box.homeScore : box.awayScore;
    opponentScore = isHome ? box.awayScore : box.homeScore;
  }

  const opponentTeam = opponentId != null ? teamsById.get(String(opponentId)) : undefined;

  return {
    week: league.currentScoringPeriodId,
    team,
    opponent: opponentTeam
      ? {
          id: opponentTeam.id,
          name: opponentTeam.name,
          avatarUrl: opponentTeam.avatarUrl,
          wins: opponentTeam.wins,
          losses: opponentTeam.losses,
          ties: opponentTeam.ties,
        }
      : null,
    teamScore,
    opponentScore,
  };
}
