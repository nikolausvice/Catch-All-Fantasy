import Link from "next/link";
import { Fragment } from "react";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues, platformIdentities } from "@/db/schema";
import { AddLeagueSection } from "@/components/add-league-section";
import { AvatarImage } from "@/components/avatar-image";
import { IntelTabs } from "@/components/intel-tabs";
import { StillPlayingSection } from "@/components/still-playing-section";
import { VennExplorer } from "@/components/venn-diagram";
import type { VennComboInfo, VennSetInfo } from "@/components/venn-diagram";
import { analyzeCrossLeague, computeMatchupWinProb } from "@/lib/leagues/cross-league";
import {
  buildRosterSets,
  computeOverlapCombos,
  type LeagueRosterSet,
} from "@/lib/leagues/roster-overlap";
import { getCurrentNflWeek } from "@/lib/leagues/week";
import { loadMatchup } from "./_load-matchup";
import type { LeagueMatchup } from "@/lib/leagues/types";
import type { CrossLeaguePlayer } from "@/lib/leagues/cross-league";

const PLATFORM_LABEL: Record<string, string> = {
  sleeper: "Sleeper",
  espn: "ESPN",
  yahoo: "Yahoo",
};

const MAX_OVERLAP_LEAGUES = 10;

type LeagueRow = typeof connectedLeagues.$inferSelect;

function toOverlapViewData(rosterSets: LeagueRosterSet[]): {
  sets: VennSetInfo[];
  combos: VennComboInfo[];
} {
  const used =
    rosterSets.length > MAX_OVERLAP_LEAGUES
      ? rosterSets.slice(0, MAX_OVERLAP_LEAGUES)
      : rosterSets;

  const combos = computeOverlapCombos(used).map((combo) => ({
    leagueIds: combo.leagueIds,
    players: combo.playerIds.map((id) => {
      const owner = used.find((s) => s.playerIds.has(id))!;
      const info = owner.players.get(id)!;
      return { id, name: info.name, position: info.position };
    }),
  }));

  const sets = used.map((s) => ({
    leagueId: s.leagueId,
    leagueName: s.leagueName,
    size: s.playerIds.size,
  }));

  return { sets, combos };
}

// ── Matchups tab ─────────────────────────────────────────────────────────────

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
              : " "}
      </p>
    </Link>
  );
}

function MatchupsTab({
  needsSetup,
  matchups,
}: {
  needsSetup: LeagueRow[];
  matchups: { league: LeagueRow; matchup: LeagueMatchup | null; error: string | null }[];
}) {
  return (
    <Fragment key="matchups">
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

      {needsSetup.length === 0 && matchups.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No leagues connected yet. Add one above to get started.
        </p>
      )}
    </Fragment>
  );
}

// ── Rooting guide ──────────────────────────────────────────────────────────

function RootingGuide({
  playerImpacts,
}: {
  playerImpacts: CrossLeaguePlayer[];
}) {
  const rootFor = playerImpacts
    .filter((p) => p.netImpact > 0 && p.isYourStarter)
    .slice(0, 8);

  const rootAgainst = playerImpacts
    .filter(
      (p) =>
        p.netImpact < 0 &&
        p.leagues.every(
          (l) => l.role === "opp-starter" || l.role === "opp-bench",
        ),
    )
    .slice(0, 8);

  const doubleEdged = playerImpacts
    .filter((p) => {
      const roles = new Set(p.leagues.map((l) => l.role));
      return (
        (roles.has("your-starter") || roles.has("your-bench")) &&
        (roles.has("opp-starter") || roles.has("opp-bench"))
      );
    })
    .slice(0, 5);

  if (rootFor.length === 0 && rootAgainst.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nothing to root for yet — check back once matchups are underway.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rootFor.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-500">
              Root for ↑
            </p>
            <ul className="flex flex-col gap-2.5">
              {rootFor.map((p) => {
                const topProj = Math.max(
                  ...p.leagues.map((l) => l.projectedPoints ?? 0),
                );
                return (
                  <li
                    key={p.playerId}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[p.position, p.proTeam].filter(Boolean).join(" · ")}
                        {topProj > 0 && ` · ${topProj.toFixed(1)} proj`}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-500">
                      +{p.netImpact.toFixed(1)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {rootAgainst.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-red-500">
              Root against ↓
            </p>
            <ul className="flex flex-col gap-2.5">
              {rootAgainst.map((p) => {
                const topProj = Math.max(
                  ...p.leagues.map((l) => l.projectedPoints ?? 0),
                );
                return (
                  <li
                    key={p.playerId}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[p.position, p.proTeam].filter(Boolean).join(" · ")}
                        {topProj > 0 && ` · ${topProj.toFixed(1)} proj`}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-red-500">
                      {p.netImpact.toFixed(1)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {doubleEdged.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-500">
              Complicated ⚡
            </p>
            <div className="flex flex-wrap gap-1.5">
              {doubleEdged.map((p) => (
                <span
                  key={p.playerId}
                  className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium"
                >
                  {p.name}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              On your roster in some leagues, opponent&apos;s in others.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

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
      leagueId: league.id,
      leagueName: league.leagueName,
      platform: league.platform,
      league,
      ...(await loadMatchup(league, userId, week)),
    })),
  );

  const analysis = analyzeCrossLeague(
    matchups.map(({ leagueId, leagueName, platform, matchup }) => ({
      leagueId,
      leagueName,
      platform,
      matchup,
    })),
  );

  const overlapOwn = toOverlapViewData(buildRosterSets(matchups, "own"));
  const overlapOpponent = toOverlapViewData(buildRosterSets(matchups, "opponent"));

  const hasData = analysis.winProbabilities.length > 0;
  const sweepPct = Math.round(analysis.probAllWins * 100);
  const failedLeagues = matchups.filter((m) => m.error);

  const espnIdentity = await db.query.platformIdentities.findFirst({
    where: and(eq(platformIdentities.userId, userId), eq(platformIdentities.platform, "espn")),
    columns: { id: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cross League Intel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every league you&apos;re playing in, compared side by side.
        </p>
      </div>

      <AddLeagueSection hasStoredEspnCookies={!!espnIdentity} />

      {failedLeagues.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">
            {failedLeagues.length === 1
              ? "1 league couldn't be loaded and is excluded below:"
              : `${failedLeagues.length} leagues couldn't be loaded and are excluded below:`}
          </p>
          <ul className="mt-1.5 list-inside list-disc">
            {failedLeagues.map((m) => (
              <li key={m.leagueId}>
                {m.leagueName} — {m.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {leagues.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No leagues connected yet. Add one above to get started.
        </div>
      ) : (
        <IntelTabs
          stillPlayingCount={analysis.remainingPlayers.length}
          overview={
            <Fragment key="overview">
              {hasData && analysis.totalMatchups > 1 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border bg-card p-5 text-center">
                    <p
                      className={`text-4xl font-bold tabular-nums ${
                        sweepPct >= 50 ? "text-emerald-500" : "text-red-500"
                      }`}
                    >
                      {sweepPct}%
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      sweep all {analysis.totalMatchups}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-5 text-center">
                    <p className="text-4xl font-bold tabular-nums">
                      {analysis.expectedWins.toFixed(1)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      expected wins
                    </p>
                  </div>
                </div>
              )}
              <MatchupsTab needsSetup={needsSetup} matchups={matchups} />
            </Fragment>
          }
          stillPlaying={<StillPlayingSection players={analysis.remainingPlayers} />}
          rootingGuide={<RootingGuide playerImpacts={analysis.playerImpacts} />}
          leagueOverlap={
            <VennExplorer
              ownSets={overlapOwn.sets}
              ownCombos={overlapOwn.combos}
              opponentSets={overlapOpponent.sets}
              opponentCombos={overlapOpponent.combos}
            />
          }
        />
      )}
    </div>
  );
}
