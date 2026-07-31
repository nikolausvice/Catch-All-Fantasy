import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues, platformIdentities } from "@/db/schema";
import { ConnectSleeperForm } from "@/components/connect-sleeper-form";
import { ConnectEspnForm } from "@/components/connect-espn-form";
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

type LeagueRow = typeof connectedLeagues.$inferSelect;

async function loadMatchup(
  league: LeagueRow,
  userId: string,
  week: number,
): Promise<{ matchup: LeagueMatchup | null; error: string | null }> {
  try {
    if (league.platform === "sleeper") {
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

function TeamScore({
  name,
  avatarUrl,
  score,
  emphasized,
}: {
  name: string;
  avatarUrl: string | null;
  score: number | null;
  emphasized?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="size-8 shrink-0 rounded-md" />
      ) : (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
          {name[0]?.toUpperCase() ?? "?"}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        {score != null && (
          <p
            className={
              emphasized
                ? "text-xs font-medium text-foreground"
                : "text-xs text-muted-foreground"
            }
          >
            {score.toFixed(1)}
          </p>
        )}
      </div>
    </div>
  );
}

function MatchupCard({
  league,
  matchup,
  error,
}: {
  league: LeagueRow;
  matchup: LeagueMatchup | null;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
        <p className="text-sm font-medium">{league.leagueName}</p>
        <p className="mt-1 text-xs text-destructive">{error}</p>
      </div>
    );
  }

  if (!matchup) return null;

  const result =
    matchup.opponent && matchup.teamScore != null && matchup.opponentScore != null
      ? matchup.teamScore > matchup.opponentScore
        ? "winning"
        : matchup.teamScore < matchup.opponentScore
          ? "losing"
          : "tied"
      : null;

  return (
    <Link
      href={`/dashboard/leagues/${league.id}`}
      className="block min-h-[44px] rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-muted-foreground">
          {league.leagueName}
        </p>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {PLATFORM_LABEL[league.platform] ?? league.platform} · Wk {matchup.week}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <TeamScore
          name={matchup.team.name}
          avatarUrl={matchup.team.avatarUrl}
          score={matchup.teamScore}
          emphasized
        />
        <span className="shrink-0 text-xs font-semibold uppercase text-muted-foreground">
          vs
        </span>
        {matchup.opponent ? (
          <TeamScore
            name={matchup.opponent.name}
            avatarUrl={matchup.opponent.avatarUrl}
            score={matchup.opponentScore}
          />
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">Bye</span>
        )}
      </div>
      {result && (
        <p
          className={
            result === "winning"
              ? "mt-2 text-xs font-medium text-primary"
              : result === "losing"
                ? "mt-2 text-xs font-medium text-destructive"
                : "mt-2 text-xs font-medium text-muted-foreground"
          }
        >
          {result === "winning"
            ? "You're winning"
            : result === "losing"
              ? "You're behind"
              : "Tied"}
        </p>
      )}
    </Link>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const leagues = await db
    .select()
    .from(connectedLeagues)
    .where(eq(connectedLeagues.userId, userId))
    .orderBy(desc(connectedLeagues.createdAt));

  const needsSetup = leagues.filter((league) => !league.userTeamId);
  const ready = leagues.filter((league) => league.userTeamId);

  const week = ready.length > 0 ? await getCurrentNflWeek() : 0;
  const matchups = await Promise.all(
    ready.map(async (league) => ({
      league,
      ...(await loadMatchup(league, userId, week)),
    })),
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Your matchups
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every league you&apos;re playing in, on one screen.
        </p>
      </div>

      {leagues.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No leagues connected yet. Add one below to get started.
        </div>
      )}

      {needsSetup.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Finish setup
          </h2>
          <ul className="flex flex-col gap-3">
            {needsSetup.map((league) => (
              <li key={league.id}>
                <Link
                  href={`/dashboard/leagues/${league.id}/select-team`}
                  className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-card p-4 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{league.leagueName}</p>
                    <p className="text-xs text-muted-foreground">
                      {PLATFORM_LABEL[league.platform] ?? league.platform} ·{" "}
                      {league.season}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-primary">
                    Pick your team →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {matchups.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            This week
          </h2>
          <ul className="flex flex-col gap-3">
            {matchups.map(({ league, matchup, error }) => (
              <li key={league.id}>
                <MatchupCard league={league} matchup={matchup} error={error} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer select-none text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          + Add another league
        </summary>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-semibold">Connect Sleeper</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Just your username — Sleeper&apos;s API is public and read-only.
            </p>
            <ConnectSleeperForm />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold">Connect ESPN</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              League ID and season are enough for public leagues; private
              leagues also need the espn_s2 and SWID cookies.
            </p>
            <ConnectEspnForm />
          </div>
        </div>
      </details>
    </div>
  );
}
