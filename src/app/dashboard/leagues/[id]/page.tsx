import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues, platformIdentities } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto/secrets";
import { EspnApiError } from "@/lib/espn/client";
import { getCachedEspnTeamMatchup, getCachedSleeperTeamMatchup } from "@/lib/leagues/cache";
import { getCurrentNflWeek } from "@/lib/leagues/week";
import { SleeperApiError } from "@/lib/sleeper/client";
import type { LeagueMatchup } from "@/lib/leagues/types";

const PLATFORM_LABEL: Record<string, string> = {
  sleeper: "Sleeper",
  espn: "ESPN",
  yahoo: "Yahoo",
};

async function loadMatchup(
  league: typeof connectedLeagues.$inferSelect,
  userId: string,
): Promise<{ matchup: LeagueMatchup | null; error: string | null }> {
  try {
    if (league.platform === "sleeper") {
      const week = await getCurrentNflWeek();
      return {
        matchup: await getCachedSleeperTeamMatchup(
          league.platformLeagueId,
          league.userTeamId!,
          week,
        ),
        error: null,
      };
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
        matchup: await getCachedEspnTeamMatchup(
          Number(league.platformLeagueId),
          Number(league.season),
          league.userTeamId!,
          espnS2,
          swid,
        ),
        error: null,
      };
    }

    return { matchup: null, error: "Yahoo leagues aren't supported yet." };
  } catch (err) {
    if (err instanceof SleeperApiError || err instanceof EspnApiError) {
      return { matchup: null, error: err.message };
    }
    throw err;
  }
}

function TeamRow({
  label,
  name,
  avatarUrl,
  score,
  record,
}: {
  label: string;
  name: string;
  avatarUrl: string | null;
  score: number | null;
  record: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="size-11 shrink-0 rounded-md" />
      ) : (
        <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-medium text-muted-foreground">
          {name[0]?.toUpperCase() ?? "?"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{record}</p>
      </div>
      {score != null && (
        <p className="shrink-0 text-xl font-semibold tabular-nums">
          {score.toFixed(1)}
        </p>
      )}
    </div>
  );
}

function record(team: { wins: number; losses: number; ties: number }): string {
  return `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""}`;
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
  if (!league.userTeamId) redirect(`/dashboard/leagues/${id}/select-team`);

  const { matchup, error } = await loadMatchup(league, userId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to dashboard
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {league.leagueName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {PLATFORM_LABEL[league.platform] ?? league.platform} ·{" "}
              {league.season}
              {matchup ? ` · Week ${matchup.week}` : ""}
            </p>
          </div>
          <Link
            href={`/dashboard/leagues/${id}/select-team`}
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Switch team
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {matchup && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <TeamRow
            label="Your team"
            name={matchup.team.name}
            avatarUrl={matchup.team.avatarUrl}
            score={matchup.teamScore}
            record={record(matchup.team)}
          />
          <div className="flex items-center gap-3 text-xs font-semibold uppercase text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            vs
            <div className="h-px flex-1 bg-border" />
          </div>
          {matchup.opponent ? (
            <TeamRow
              label="Opponent"
              name={matchup.opponent.name}
              avatarUrl={matchup.opponent.avatarUrl}
              score={matchup.opponentScore}
              record={record(matchup.opponent)}
            />
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Bye week — no opponent scheduled.
            </p>
          )}
        </div>
      )}

      {matchup && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your roster
          </h2>
          {matchup.team.players.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No players rostered yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
              {matchup.team.players.map((player) => (
                <li
                  key={player.id}
                  className="flex items-center justify-between gap-2 py-1 text-sm"
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
      )}
    </div>
  );
}
