import {
  getSleeperLeagueRosters,
  getSleeperLeagueUsers,
  getSleeperPlayers,
  sleeperAvatarUrl,
} from "@/lib/sleeper/client";
import type { LeagueTeam } from "./types";

export async function getSleeperLeagueTeams(
  leagueId: string,
): Promise<LeagueTeam[]> {
  const [rosters, users, players] = await Promise.all([
    getSleeperLeagueRosters(leagueId),
    getSleeperLeagueUsers(leagueId),
    getSleeperPlayers(),
  ]);

  const usersById = new Map(users.map((user) => [user.user_id, user]));

  return rosters.map((roster) => {
    const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
    const starterIds = new Set(roster.starters ?? []);
    const name =
      owner?.metadata?.team_name || owner?.display_name || `Team ${roster.roster_id}`;

    return {
      id: String(roster.roster_id),
      name,
      avatarUrl: owner ? sleeperAvatarUrl(owner.avatar) : null,
      wins: roster.settings.wins,
      losses: roster.settings.losses,
      ties: roster.settings.ties,
      players: (roster.players ?? []).map((playerId) => {
        const player = players[playerId];
        return {
          id: playerId,
          name: player?.full_name || `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim() || playerId,
          position: player?.position ?? null,
          proTeam: player?.team ?? null,
          isStarter: starterIds.has(playerId),
        };
      }),
    };
  });
}
