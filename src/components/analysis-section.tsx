import type { CrossLeagueAnalysis, RemainingPlayerAnalysis } from "@/lib/leagues/cross-league";

/**
 * Three flat, solid states — losing (red), split (orange), winning (green).
 * No blending between them: a continuous gradient reads a "51% toward green"
 * band as barely different from a "90% toward green" one, and a blended
 * midpoint (this used to shade continuously through the win/loss colors,
 * before that through amber) never lands on a clean, nameable color. Each
 * of the three is its own flat, fully-saturated stop (--color-outcome-*,
 * shared with outcome-landscape-section.tsx, themed in globals.css).
 */
function bandColor(wins: number, total: number): string {
  const frac = total > 0 ? wins / total : 0.5;
  if (frac === 0.5) return "var(--color-outcome-mid)";
  return frac > 0.5 ? "var(--color-outcome-win)" : "var(--color-outcome-loss)";
}

/**
 * Rounds fractions (summing to ~1) to whole percentages that always sum to
 * exactly 100 — plain per-entry Math.round can land on 99 or 101 depending
 * on how the fractional parts fall. Every entry gets its floor, then the
 * entries with the largest dropped remainders each get +1 until the total
 * reaches 100.
 */
function roundToWholePercentages(fractions: number[]): number[] {
  const scaled = fractions.map((f) => f * 100);
  const floors = scaled.map(Math.floor);
  const shortfall = 100 - floors.reduce((a, b) => a + b, 0);
  const remainders = scaled.map((v, i) => ({ i, remainder: v - floors[i] }));
  remainders.sort((a, b) => b.remainder - a.remainder);
  const result = [...floors];
  for (let n = 0; n < shortfall; n++) result[remainders[n].i] += 1;
  return result;
}

/** Horizontal bar chart of P(exactly k wins) for k = 0..N — the shape of the whole week's outcome.
 * Colored on the same red/orange/green scale as the outcome line below, so 0 wins and N wins read
 * the same way here as they do there. */
function WinDistribution({ distribution }: { distribution: number[] }) {
  const total = distribution.length - 1;
  const maxProb = Math.max(...distribution);
  const mostLikely = distribution.indexOf(maxProb);
  const percentages = roundToWholePercentages(distribution);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      {distribution.map((_, k) => {
        const pct = percentages[k];
        const isBest = k === mostLikely;
        return (
          <div key={k} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">
              {k} win{k === 1 ? "" : "s"}
            </span>
            <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{
                  width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`,
                  backgroundColor: bandColor(k, total),
                }}
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

/**
 * Each card gets its own axis, scaled to that player's own thresholds — a player whose
 * break-evens sit in the 0–10 range shouldn't be squeezed into a shared axis stretched by
 * some other player's break-even out at 80.
 *
 * Built only from still-pending leagues' thresholds, same as computeRecordBands — a
 * resolved league's breakEvenPoints is retrospective, not part of the live axis, and
 * stretching the domain to fit it would open a gap between the domain edge and where
 * the colored line (which also ignores resolved thresholds) actually starts.
 */
function computePlayerDomain(entry: RemainingPlayerAnalysis): { min: number; max: number } {
  const pending = entry.leagues.filter((l) => !l.resolved);
  let min = 0;
  for (const l of pending) min = Math.min(min, l.breakEvenPoints ?? 0);
  const max = Math.max(
    10,
    ...pending.map((l) => l.breakEvenPoints ?? 0),
    entry.projectedPoints * 1.1,
    entry.currentPoints + 4,
  );
  return { min, max: max > min ? max : min + 10 };
}

function ConflictPlayerCard({ entry }: { entry: RemainingPlayerAnalysis }) {
  const { min: domainMin, max: domainMax } = computePlayerDomain(entry);
  const span = domainMax - domainMin;
  const total = entry.leagues.length;
  const pct = (x: number) =>
    ((Math.min(Math.max(x, domainMin), domainMax) - domainMin) / span) * 100;
  const isLive = entry.currentPoints > 0;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="truncate text-sm font-medium">{entry.name}</p>
        <div className="flex flex-wrap justify-center gap-1">
          {entry.leagues.map((l) => (
            <span
              key={l.leagueId}
              title={l.description}
              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
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
      <div className="relative h-6 w-full">
        <svg
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={`${entry.name}'s record across ${total} leagues as a function of their points, currently at ${entry.currentPoints.toFixed(1)}. Green is a winning record, red losing, orange split. Each divider's confidence percentage reflects how many other unfinished starters could still move that threshold — 100% means this player is the last one left.`}
        >
          {entry.recordBands.map((band, i) => (
            <line
              key={i}
              x1={pct(band.min)}
              y1={5}
              x2={pct(band.max ?? domainMax)}
              y2={5}
              stroke={bandColor(band.wins, total)}
              strokeWidth={1.2}
            />
          ))}
          {entry.leagues
            // A resolved league's threshold is retrospective, not part of
            // this "what should they do from here" axis — and with
            // computePlayerDomain now excluding it too, plotting it here
            // would sit right at (or past) the domain edge, disconnected
            // from the colored line.
            .filter((l) => l.breakEvenPoints != null && !l.resolved)
            .map((l) => {
              const x = pct(l.breakEvenPoints!);
              return (
                <line
                  key={l.leagueId}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={10}
                  stroke="white"
                  strokeWidth={0.5}
                />
              );
            })}
        </svg>
        {/* Rendered as an HTML circle, not an SVG one, because the svg above
            is non-uniformly scaled (preserveAspectRatio="none" on a 100x10
            viewBox stretched to fill a much wider-than-tall box) — a circle
            drawn in that coordinate space comes out as a stretched ellipse
            on any screen wider than it is tall. */}
        {isLive && (
          <div
            className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
            style={{
              left: `${pct(entry.currentPoints)}%`,
              backgroundColor: "var(--color-foreground)",
              borderColor: "var(--color-card)",
            }}
          />
        )}
      </div>
      <div className="relative h-7 w-full">
        {entry.leagues
          .filter((l) => l.breakEvenPoints != null && !l.resolved)
          .map((l) => {
            // How many OTHER unfinished starters (either side) could still
            // move this threshold, turned into a confidence percentage —
            // 100% when this player is the only one left to play in that
            // league, halving each time one more still-live starter is
            // added, since each one is an independent extra source of
            // variance that could swing it.
            const confidencePct = Math.round(100 / (1 + l.remainingOthers));
            return (
              <span
                key={l.leagueId}
                className="absolute -translate-x-1/2 whitespace-nowrap text-center text-[10px] leading-tight text-foreground"
                style={{ left: `${pct(l.breakEvenPoints!)}%` }}
              >
                <span className="block font-medium">{Math.round(l.breakEvenPoints!)}</span>
                <span className="block text-muted-foreground">{confidencePct}%</span>
              </span>
            );
          })}
      </div>
    </div>
  );
}

function ConflictPlayersTable({ players }: { players: RemainingPlayerAnalysis[] }) {
  const conflicted = players.filter((p) => p.hasConflict && p.leagues.length > 1);
  if (conflicted.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {conflicted.map((entry) => (
        <ConflictPlayerCard key={entry.playerId} entry={entry} />
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
