import { getEspnLeagueInfo, getEspnLeagueTeams } from "@/lib/espn/client";
import type { LeagueTeam } from "./types";

export async function getEspnLeagueTeamsUnified({
  leagueId,
  seasonId,
  espnS2,
  swid,
}: {
  leagueId: number;
  seasonId: number;
  espnS2?: string;
  swid?: string;
}): Promise<LeagueTeam[]> {
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
