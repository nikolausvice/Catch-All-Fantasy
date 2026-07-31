import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues } from "@/db/schema";
import { AddLeagueSection } from "@/components/add-league-section";
import { AvatarImage } from "@/components/avatar-image";
import { computeMatchupWinProb } from "@/lib/leagues/cross-league";
import { getCurrentNflWeek } from "@/lib/leagues/week";
import { loadMatchup } from "./_load-matchup";
import type { LeagueMatchup } from "@/lib/leagues/types";

const PLATFORM_LABEL: Record<string, string> = {
  sleeper: "Sleeper",
  espn: "ESPN",
  yahoo: "Yahoo",
};

type LeagueRow = typeof connectedLeagues.$inferSelect;

function TeamScore({
  name,
  avatarUrl,
  score,
  projectedScore,
  emphasized,
  reversed,
}: {
  name: string;
  avatarUrl: string | null;
  score: number | null;
  projectedScore?: number;
  emphasized?: boolean;
  reversed?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${reversed ? "flex-row-reverse" : ""}`}>
      <AvatarImage
        name={name}
        avatarUrl={avatarUrl}
        className="size-8 shrink-0 rounded-md"
        fallbackClassName="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground"
      />
      <div className={`min-w-0 ${reversed ? "text-right" : ""}`}>
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
            {projectedScore != null && (
              <span className="text-muted-foreground/50"> (proj {projectedScore.toFixed(1)})</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function ByePlaceholder({ reversed }: { reversed?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${reversed ? "flex-row-reverse" : ""}`}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
        –
      </div>
      <div className={`min-w-0 ${reversed ? "text-right" : ""}`}>
        <p className="truncate text-sm font-medium text-muted-foreground">Bye</p>
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

  const winProb = computeMatchupWinProb(matchup);
  const winPct = Math.round(winProb.winProbability * 100);
  const winBarColor =
    winPct >= 60 ? "bg-emerald-500" : winPct <= 40 ? "bg-red-500" : "bg-amber-400";
  const winTextColor =
    winPct >= 60
      ? "text-emerald-500"
      : winPct <= 40
        ? "text-red-500"
        : "text-amber-500";

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
          projectedScore={matchup.teamProjectedScore}
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
            projectedScore={matchup.opponentProjectedScore}
            reversed
          />
        ) : (
          <ByePlaceholder reversed />
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          {!winProb.isBye && (
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all ${winBarColor}`}
              style={{ width: `${winPct}%` }}
            />
          )}
        </div>
        <span
          className={`w-9 shrink-0 text-right text-xs font-bold tabular-nums ${
            winProb.isBye ? "text-muted-foreground" : winTextColor
          }`}
        >
          {winProb.isBye ? "Bye" : `${winPct}%`}
        </span>
      </div>
      <p
        className={
          result === "winning"
            ? "mt-2 text-xs font-medium text-primary"
            : result === "losing"
              ? "mt-2 text-xs font-medium text-destructive"
              : result === "tied"
                ? "mt-2 text-xs font-medium text-muted-foreground"
                : "mt-2 text-xs font-medium text-muted-foreground/0"
        }
      >
        {result === "winning"
          ? "You're winning"
          : result === "losing"
            ? "You're behind"
            : result === "tied"
              ? "Tied"
              : " "}
      </p>
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

      <AddLeagueSection />
    </div>
  );
}
