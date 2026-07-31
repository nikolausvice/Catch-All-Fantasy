import Link from "next/link";
import { Fragment } from "react";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues } from "@/db/schema";
import { IntelTabs } from "@/components/intel-tabs";
import { StillPlayingSection } from "@/components/still-playing-section";
import { VennExplorer } from "@/components/venn-diagram";
import type { VennComboInfo, VennSetInfo } from "@/components/venn-diagram";
import { analyzeCrossLeague } from "@/lib/leagues/cross-league";
import {
  buildRosterSets,
  computeOverlapCombos,
  type LeagueRosterSet,
} from "@/lib/leagues/roster-overlap";
import { getCurrentNflWeek } from "@/lib/leagues/week";
import { loadMatchup } from "../_load-matchup";
import type { CrossLeaguePlayer, LeagueWinProb } from "@/lib/leagues/cross-league";

const MAX_OVERLAP_LEAGUES = 10;

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

// ── Win probability row ────────────────────────────────────────────────────

function WinProbRow({ w }: { w: LeagueWinProb }) {
  const pct = Math.round(w.winProbability * 100);
  const barColor =
    pct >= 60 ? "bg-emerald-500" : pct <= 40 ? "bg-red-500" : "bg-amber-400";
  const textColor =
    pct >= 60
      ? "text-emerald-500"
      : pct <= 40
        ? "text-red-500"
        : "text-amber-500";

  return (
    <Link
      href={`/dashboard/leagues/${w.leagueId}`}
      className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{w.leagueName}</p>
        {w.isBye ? (
          <p className="mt-0.5 text-xs text-muted-foreground">No opponent this week</p>
        ) : (
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {w.teamScore?.toFixed(1) ?? "0.0"} –{" "}
            {w.opponentScore?.toFixed(1) ?? "0.0"}
            {w.teamProjectedScore != null && (
              <span className="text-muted-foreground/50">
                {" "}
                (proj {w.teamProjectedScore.toFixed(1)} –{" "}
                {w.opponentProjectedScore?.toFixed(1) ?? "?"})
              </span>
            )}
          </p>
        )}
      </div>
      {w.isBye ? (
        <>
          <div className="relative h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted" />
          <span className="w-9 shrink-0 text-right text-sm font-bold tabular-nums text-muted-foreground">
            Bye
          </span>
        </>
      ) : (
        <>
          <div className="relative h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span
            className={`w-9 shrink-0 text-right text-sm font-bold tabular-nums ${textColor}`}
          >
            {pct}%
          </span>
        </>
      )}
    </Link>
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

  if (rootFor.length === 0 && rootAgainst.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Rooting Guide
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
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
      </div>

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
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function IntelPage() {
  const session = await auth();
  const userId = session!.user.id;

  const leagues = await db
    .select()
    .from(connectedLeagues)
    .where(eq(connectedLeagues.userId, userId))
    .orderBy(desc(connectedLeagues.createdAt));

  const ready = leagues.filter((l) => l.userTeamId);
  const week = ready.length > 0 ? await getCurrentNflWeek() : 0;

  const matchups = await Promise.all(
    ready.map(async (league) => ({
      leagueId: league.id,
      leagueName: league.leagueName,
      platform: league.platform,
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

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <h1 className="text-2xl font-semibold tracking-tight">Intel</h1>

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

      {!hasData && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No active matchups found. Finish setting up your leagues on the
          dashboard.
        </div>
      )}

      {hasData && (
        <IntelTabs
          stillPlayingCount={analysis.remainingPlayers.length}
          overview={
            <Fragment key="overview">
              {/* Hero stats */}
              {analysis.totalMatchups > 1 && (
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

              {/* Win probability */}
              <section className="flex flex-col gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Win Probability
                </h2>
                <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card px-4">
                  {analysis.winProbabilities.map((w) => (
                    <WinProbRow key={w.leagueId} w={w} />
                  ))}
                </div>
              </section>
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
