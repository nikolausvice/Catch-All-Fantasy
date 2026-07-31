import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues } from "@/db/schema";
import { RefreshButton } from "@/components/refresh-button";
import { analyzeCrossLeague } from "@/lib/leagues/cross-league";
import { getCurrentNflWeek } from "@/lib/leagues/week";
import { loadMatchup } from "../_load-matchup";
import type {
  CrossLeaguePlayer,
  LeagueWinProb,
  RemainingPlayerAnalysis,
} from "@/lib/leagues/cross-league";

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
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{w.leagueName}</p>
        {!w.isBye && (
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
        <span className="shrink-0 text-xs text-muted-foreground">Bye</span>
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
    </div>
  );
}

// ── Remaining player card ──────────────────────────────────────────────────

function RemainingCard({ p }: { p: RemainingPlayerAnalysis }) {
  const yourLeagues = p.leagues.filter((l) => l.role === "your-starter");
  const oppLeagues = p.leagues.filter((l) => l.role === "opp-starter");

  return (
    <div
      className={`rounded-xl border p-4 ${
        p.hasConflict
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-border bg-card"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{p.name}</p>
          <p className="text-xs text-muted-foreground">
            {[p.position, p.proTeam].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold tabular-nums">
            {p.projectedPoints.toFixed(1)}
          </p>
          <p className="text-[10px] text-muted-foreground">proj pts</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {yourLeagues.map((l) => (
          <span
            key={l.leagueId}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
          >
            ↑ {l.leagueName}
          </span>
        ))}
        {oppLeagues.map((l) => (
          <span
            key={l.leagueId}
            className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive"
          >
            ↓ {l.leagueName}
          </span>
        ))}
      </div>

      {p.hasConflict ? (
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
          {p.sweetSpot ? (
            <>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sweet spot{" "}
              </span>
              <span className="font-bold text-primary">
                {p.sweetSpot.min.toFixed(1)}–{p.sweetSpot.max.toFixed(1)} pts
              </span>
            </>
          ) : (
            <span className="text-xs font-semibold text-destructive">
              No sweet spot — any score helps one league and hurts another.
            </span>
          )}
        </div>
      ) : yourLeagues.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {yourLeagues[0].winningWithout
            ? "Winning even if they score 0"
            : yourLeagues[0].breakEvenPoints != null &&
                yourLeagues[0].breakEvenPoints > 0
              ? `Needs ~${yourLeagues[0].breakEvenPoints.toFixed(1)} pts to clinch`
              : "Any score helps"}
        </p>
      ) : oppLeagues.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {oppLeagues[0].winningWithout
            ? "You're winning even at their projection"
            : oppLeagues[0].breakEvenPoints != null
              ? `Must score under ${oppLeagues[0].breakEvenPoints.toFixed(1)} pts for you to win`
              : "Keep an eye on this one"}
        </p>
      ) : null}
    </div>
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

  const hasData = analysis.winProbabilities.length > 0;
  const sweepPct = Math.round(analysis.probAllWins * 100);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Intel</h1>
          <RefreshButton />
        </div>
      </div>

      {!hasData && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No active matchups found. Finish setting up your leagues on the
          dashboard.
        </div>
      )}

      {hasData && (
        <>
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

          {/* Still playing */}
          {analysis.remainingPlayers.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Still Playing
              </h2>
              <div className="flex flex-col gap-3">
                {analysis.remainingPlayers.map((p) => (
                  <RemainingCard key={p.playerId} p={p} />
                ))}
              </div>
            </section>
          )}

          {/* Rooting guide */}
          <RootingGuide playerImpacts={analysis.playerImpacts} />
        </>
      )}
    </div>
  );
}
