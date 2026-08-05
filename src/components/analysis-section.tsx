import type { CrossLeagueAnalysis, RemainingPlayerAnalysis } from "@/lib/leagues/cross-league";

/**
 * Three flat, solid states — losing (red), split (amber), winning (green) —
 * no blending between them: a continuous gradient reads a "51% toward
 * green" band as barely different from a "90% toward green" one, and a
 * blended midpoint never lands on a clean, nameable color. Same red/amber/
 * emerald hues as the Players tab's own/opponent/mix coloring
 * (--color-outcome-*, shared with outcome-landscape-section.tsx, themed in
 * globals.css), so a color means the same thing everywhere in the app.
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
 * Colored on the same red/amber/green scale as the outcome line below, so 0 wins and N wins read
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

  // Resolved leagues are excluded — their threshold is retrospective, not
  // part of this "what should they do from here" axis, and with
  // computePlayerDomain also excluding them, plotting one here would sit
  // right at (or past) the domain edge, disconnected from the colored line.
  //
  // leftX/rightX are pre-clamped to the visible 0–100 range, and centerX is
  // the midpoint of THOSE clamped edges rather than of the raw (unclamped)
  // threshold — a box whose left edge got clamped to 0 is no longer centered
  // on the raw value, so the "~" label needs to follow the box it's actually
  // labeling, not the point that box was originally centered on.
  const dividers = entry.leagues
    .filter((l) => l.breakEvenPoints != null && !l.resolved)
    .map((l) => {
      const x = pct(l.breakEvenPoints!);
      // Uncertainty as width instead of a percentage: each OTHER
      // still-unfinished starter (either side) is one more independent
      // source of variance that could move this threshold, so the box
      // widens — a lone remaining starter (remainingOthers = 0) collapses
      // to zero width, drawn as a single bar instead of a box.
      const halfWidth = l.isExact ? 0 : 6 * (l.remainingOthers / (1 + l.remainingOthers));
      const leftX = Math.max(0, x - halfWidth);
      const rightX = Math.min(100, x + halfWidth);
      return { league: l, leftX, rightX, centerX: (leftX + rightX) / 2 };
    });

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
          aria-label={`${entry.name}'s record across ${total} leagues as a function of their points, currently at ${entry.currentPoints.toFixed(1)}. Green is a winning record, red losing, amber split. Each threshold is drawn as a box that widens the more other unfinished starters could still move it, collapsing to a single line when this player is the last one left.`}
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
          {dividers.map(({ league: l, leftX, rightX }) =>
            // Exact (this player is the last one left in that league) — a
            // single bar, no box.
            l.isExact ? (
              <line
                key={l.leagueId}
                x1={leftX}
                y1={0}
                x2={leftX}
                y2={10}
                stroke="white"
                strokeWidth={0.5}
              />
            ) : (
              <rect
                key={l.leagueId}
                x={leftX}
                y={0.5}
                width={rightX - leftX}
                height={9}
                fill="none"
                stroke="white"
                strokeWidth={0.5}
              />
            ),
          )}
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
      <div className="relative h-4 w-full">
        {dividers.map(({ league: l, centerX }) => (
          <span
            key={l.leagueId}
            // Sign carries the meaning here (needs more vs. already
            // covered), so it's colored instead of prefixed with a "~" —
            // that symbol read as too easily confused with the minus sign
            // on a negative number.
            className={`absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-medium leading-none ${
              l.breakEvenPoints! < 0
                ? "text-red-600 dark:text-red-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
            // Centered on the box's own (possibly edge-clamped) midpoint,
            // not the raw threshold — see the dividers comment above.
            style={{ left: `${centerX}%` }}
          >
            {Math.round(l.breakEvenPoints!)}
          </span>
        ))}
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
