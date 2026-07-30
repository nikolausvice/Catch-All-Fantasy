import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues, platformIdentities } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto/secrets";
import { EspnApiError } from "@/lib/espn/client";
import { getEspnLeagueTeamsUnified } from "@/lib/leagues/espn";
import { getSleeperLeagueTeams } from "@/lib/leagues/sleeper";
import { SleeperApiError } from "@/lib/sleeper/client";
import type { LeagueTeam } from "@/lib/leagues/types";
import { SelectTeamButton } from "./select-team-button";

const PLATFORM_LABEL: Record<string, string> = {
  sleeper: "Sleeper",
  espn: "ESPN",
  yahoo: "Yahoo",
};

async function loadTeams(
  league: typeof connectedLeagues.$inferSelect,
  userId: string,
): Promise<{ teams: LeagueTeam[] | null; error: string | null }> {
  try {
    if (league.platform === "sleeper") {
      return { teams: await getSleeperLeagueTeams(league.platformLeagueId), error: null };
    }

    if (league.platform === "espn") {
      let espnS2: string | undefined;
      let swid: string | undefined;

      if (league.platformUserId) {
        const identity = await db.query.platformIdentities.findFirst({
          where: and(
            eq(platformIdentities.userId, userId),
            eq(platformIdentities.platform, "espn"),
            eq(platformIdentities.platformUserId, league.platformUserId),
          ),
        });
        if (identity?.encryptedSecret) {
          espnS2 = decryptSecret(identity.encryptedSecret);
          swid = identity.platformUserId;
        }
      }

      return {
        teams: await getEspnLeagueTeamsUnified({
          leagueId: Number(league.platformLeagueId),
          seasonId: Number(league.season),
          espnS2,
          swid,
        }),
        error: null,
      };
    }

    return { teams: null, error: "Yahoo leagues aren't supported yet." };
  } catch (err) {
    if (err instanceof SleeperApiError || err instanceof EspnApiError) {
      return { teams: null, error: err.message };
    }
    throw err;
  }
}

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const league = await db.query.connectedLeagues.findFirst({
    where: and(
      eq(connectedLeagues.id, id),
      eq(connectedLeagues.userId, userId),
    ),
  });

  if (!league) notFound();

  const { teams, error } = await loadTeams(league, userId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {league.leagueName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {PLATFORM_LABEL[league.platform] ?? league.platform} · {league.season}
          {league.userTeamName ? ` · Your team: ${league.userTeamName}` : ""}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {teams && teams.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No teams found yet — this league may not have any rosters set up.
        </div>
      )}

      {teams && teams.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {teams.map((team) => {
            const isSelected = league.userTeamId === team.id;
            return (
              <div
                key={team.id}
                className={
                  isSelected
                    ? "rounded-xl border-2 border-primary bg-card p-4"
                    : "rounded-xl border border-border bg-card p-4"
                }
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    {team.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={team.avatarUrl}
                        alt=""
                        className="size-9 rounded-md"
                      />
                    ) : (
                      <div className="flex size-9 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                        {team.name[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{team.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {team.wins}-{team.losses}
                        {team.ties ? `-${team.ties}` : ""}
                      </p>
                    </div>
                  </div>
                  <SelectTeamButton
                    leagueRowId={league.id}
                    teamId={team.id}
                    teamName={team.name}
                    isSelected={isSelected}
                  />
                </div>

                {team.players.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No players rostered yet.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {team.players.map((player) => (
                      <li
                        key={player.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="truncate">{player.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {[player.position, player.proTeam]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
