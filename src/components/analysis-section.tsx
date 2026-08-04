import type { CrossLeagueAnalysis, RemainingPlayerAnalysis } from "@/lib/leagues/cross-league";

/** Horizontal bar chart of P(exactly k wins) for k = 0..N — the shape of the whole week's outcome. */
function WinDistribution({ distribution }: { distribution: number[] }) {
  const maxProb = Math.max(...distribution);
  const mostLikely = distribution.indexOf(maxProb);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      {distribution.map((p, k) => {
        const pct = Math.round(p * 100);
        const isBest = k === mostLikely;
        return (
          <div key={k} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">
              {k} win{k === 1 ? "" : "s"}
            </span>
            <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                  isBest ? "bg-primary" : "bg-muted-foreground/40"
                }`}
                style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
              />
            </div>
            <span
              className={`w-11 shrink-0 text-right text-xs font-bold tabular-nums ${
                isBest ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Green when this band's record favors you, red when it doesn't, amber on a tie — same
 * language as the record itself, not an arbitrary palette. */
function bandToneClass(wins: number, losses: number): string {
  if (wins === losses) return "bg-amber-500/60 text-amber-50";
  return wins > losses ? "bg-emerald-500/60 text-emerald-50" : "bg-red-500/60 text-red-50";
}

/**
 * A conflicted player's score axis, split into the win/loss-record bands computeRecordBands
 * already worked out — a genuine step function: record only changes at a threshold, not
 * gradually. The player's projected (and, mid-game, live) point total is marked on top so it's
 * obvious which band they're actually on track to land in.
 *
 * The bands themselves are literally out of focus while other starters elsewhere could still
 * move the thresholds — `blurPx` comes from how many of THOSE starters are left, so the same
 * bar visibly sharpens, frame over frame as the week's games finish, without ever needing a
 * separate "estimate" vs. "final" toggle. The markers and axis labels stay crisp throughout —
 * only the thresholds themselves are what's uncertain, not where this player's own score sits.
 */
function StepFunctionBar({
  entry,
  blurPx,
}: {
  entry: RemainingPlayerAnalysis;
  blurPx: number;
}) {
  const bands = entry.recordBands;
  if (bands.length === 0) return null;

  const mins = bands.map((b) => b.min);
  const domainMin = mins[0];
  const lastMin = mins[mins.length - 1];
  const padding = Math.max(6, entry.projectedPoints * 0.35);
  const domainMax = Math.max(
    lastMin + padding,
    entry.projectedPoints * 1.15,
    entry.currentPoints + 4,
    domainMin + 1,
  );
  const span = domainMax - domainMin;

  function pct(x: number): number {
    return ((Math.min(Math.max(x, domainMin), domainMax) - domainMin) / span) * 100;
  }

  const isLive = entry.currentPoints > 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-8 overflow-hidden rounded-md">
        <div
          className="flex h-full w-full transition-[filter] duration-700 ease-out"
          style={{ filter: blurPx > 0 ? `blur(${blurPx}px)` : "none" }}
        >
          {bands.map((band, i) => {
            const left = pct(band.min);
            const right = band.max == null ? 100 : pct(band.max);
            const width = Math.max(right - left, 0);
            return (
              <div
                key={i}
                className={`flex items-center justify-center text-[11px] font-bold tabular-nums ${bandToneClass(band.wins, band.losses)}`}
                style={{ width: `${width}%` }}
                title={`${band.min.toFixed(1)}${band.max == null ? "+" : `–${band.max.toFixed(1)}`} pts → ${band.wins}-${band.losses}`}
              >
                {width > 9 ? `${band.wins}-${band.losses}` : ""}
              </div>
            );
          })}
        </div>
        <div
          className="absolute inset-y-0 w-0.5 bg-foreground/70"
          style={{ left: `${pct(entry.projectedPoints)}%` }}
          title={`Projected: ${entry.projectedPoints.toFixed(1)} pts`}
        />
        {isLive && (
          <div
            className="absolute inset-y-0 w-0.5 bg-foreground"
            style={{ left: `${pct(entry.currentPoints)}%` }}
            title={`Live: ${entry.currentPoints.toFixed(1)} pts`}
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{domainMin.toFixed(0)} pts</span>
        <span>{domainMax.toFixed(0)} pts</span>
      </div>
    </div>
  );
}

/**
 * Every league this player is caught between — "for" (your starter, ↑) and "against" (an
 * opponent's starter, ↓) — with the exact points they'd need in that one league. Confidence
 * is capped by whichever of those leagues still has the most OTHER starters left to play —
 * that's the number of games standing between this bar and being fully in focus.
 */
function ConflictPlayerRow({ entry }: { entry: RemainingPlayerAnalysis }) {
  const maxRemainingOthers = Math.max(...entry.leagues.map((l) => l.remainingOthers));
  // Caps out around 5 other starters left — beyond that it's already about as blurred as it's
  // useful to render, so more remaining games just hold at "very blurry" instead of vanishing.
  const blurPx = Math.min(4, maxRemainingOthers * 0.8);

  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center">
      <div>
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{entry.name}</p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              maxRemainingOthers === 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {maxRemainingOthers === 0
              ? "Final"
              : `Sharpens as ${maxRemainingOthers} more starter${maxRemainingOthers === 1 ? "" : "s"} finish${
                  maxRemainingOthers === 1 ? "es" : ""
                }`}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {entry.position} · {entry.proTeam}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entry.leagues.map((l) => (
            <span
              key={l.leagueId}
              title={l.description}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                l.role === "your-starter"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-red-500/15 text-red-400"
              }`}
            >
              {l.role === "your-starter" ? "↑" : "↓"} {l.leagueName}
            </span>
          ))}
        </div>
      </div>
      <StepFunctionBar entry={entry} blurPx={blurPx} />
    </div>
  );
}

function ConflictPlayersTable({ players }: { players: RemainingPlayerAnalysis[] }) {
  const conflicted = players.filter((p) => p.hasConflict && p.recordBands.length > 0);
  if (conflicted.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Players you&apos;re rostering on both sides — your starter in one league, an
        opponent&apos;s starter in another. Each bar shows the record across those leagues at
        every score this player could still land on.
      </p>
      {conflicted.map((entry) => (
        <ConflictPlayerRow key={entry.playerId} entry={entry} />
      ))}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function AnalysisSection({
  analysis,
}: {
  analysis: CrossLeagueAnalysis;
}) {
  if (analysis.totalMatchups === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No active matchups to analyze yet — check back once the week&apos;s games are set.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {analysis.totalMatchups > 1 && (
        <Section title="Win scenarios">
          <WinDistribution distribution={analysis.winCountDistribution} />
          <ConflictPlayersTable players={analysis.remainingPlayers} />
        </Section>
      )}
    </div>
  );
}
