import {
  getSleeperLeagueRosters,
  getSleeperLeagueUsers,
  getSleeperMatchups,
  getSleeperPlayers,
  sleeperAvatarUrl,
} from "@/lib/sleeper/client";
import type { SleeperRoster, SleeperUser } from "@/lib/sleeper/types";
import type { LeagueMatchup, LeagueTeam, LeagueTeamSummary } from "./types";

function rosterTeamName(
  roster: SleeperRoster,
  owner: SleeperUser | undefined,
): string {
  return (
    owner?.metadata?.team_name || owner?.display_name || `Team ${roster.roster_id}`
  );
}

async function getSleeperRosterSummaries(
  leagueId: string,
): Promise<{ rosters: SleeperRoster[]; summaries: LeagueTeamSummary[] }> {
  const [rosters, users] = await Promise.all([
    getSleeperLeagueRosters(leagueId),
    getSleeperLeagueUsers(leagueId),
  ]);

  const usersById = new Map(users.map((user) => [user.user_id, user]));

  const summaries = rosters.map((roster) => {
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    return {
      id: String(roster.roster_id),
      name: rosterTeamName(roster, owner),
      avatarUrl: owner ? sleeperAvatarUrl(owner.avatar) : null,
      wins: roster.settings.wins,
      losses: roster.settings.losses,
      ties: roster.settings.ties,
    };
  });

  return { rosters, summaries };
}

/** Lightweight team list (no rosters/players) for the team picker screen. */
export async function getSleeperTeamSummaries(
  leagueId: string,
): Promise<LeagueTeamSummary[]> {
  const { summaries } = await getSleeperRosterSummaries(leagueId);
  return summaries;
}

export async function getSleeperLeagueTeams(
  leagueId: string,
): Promise<LeagueTeam[]> {
  const [{ rosters, summaries }, players] = await Promise.all([
    getSleeperRosterSummaries(leagueId),
    getSleeperPlayers(),
  ]);

  const summariesById = new Map(summaries.map((summary) => [summary.id, summary]));

  return rosters.map((roster) => {
    const summary = summariesById.get(String(roster.roster_id))!;
    const starterIds = new Set(roster.starters ?? []);

    return {
      ...summary,
      players: (roster.players ?? []).map((playerId) => {
        const player = players[playerId];
        return {
          id: playerId,
          name:
            player?.full_name ||
            `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim() ||
            playerId,
          position: player?.position ?? null,
          proTeam: player?.team ?? null,
          isStarter: starterIds.has(playerId),
        };
      }),
    };
  });
}

/**
 * The user's own team (full roster) plus this week's opponent. Returns
 * `opponent: null` when the team has a bye.
 */
export async function getSleeperTeamMatchup({
  leagueId,
  rosterId,
  week,
}: {
  leagueId: string;
  rosterId: string;
  week: number;
}): Promise<LeagueMatchup> {
  const [teams, matchups] = await Promise.all([
    getSleeperLeagueTeams(leagueId),
    getSleeperMatchups(leagueId, week),
  ]);

  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const team = teamsById.get(rosterId);
  if (!team) {
    throw new Error(`No Sleeper roster ${rosterId} found in league ${leagueId}.`);
  }

  const myMatchup = matchups.find((m) => String(m.roster_id) === rosterId);
  const opponentMatchup =
    myMatchup?.matchup_id != null
      ? matchups.find(
          (m) =>
            m.matchup_id === myMatchup.matchup_id &&
            String(m.roster_id) !== rosterId,
        )
      : undefined;

  const opponentTeam = opponentMatchup
    ? teamsById.get(String(opponentMatchup.roster_id)) ?? null
    : null;

  return {
    week,
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
    teamScore: myMatchup?.points ?? null,
    opponentScore: opponentMatchup?.points ?? null,
  };
}
