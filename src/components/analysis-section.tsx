"use client";

import { useState } from "react";
import type { CrossLeagueAnalysis, RemainingPlayerAnalysis } from "@/lib/leagues/cross-league";

/**
 * Wins → red (bad) / green (good) — used only for the aggregate win-count
 * histogram (WinDistribution) below, where "how many of your N leagues do
 * you win" really is the whole question. The per-player conflict cards use
 * a different, more specific scheme — see computeComboBands.
 */
function bandColor(wins: number, total: number): string {
  const frac = total > 0 ? wins / total : 0.5;
  if (frac === 0.5) return "var(--color-outcome-mid)";
  return frac > 0.5 ? "var(--color-outcome-win)" : "var(--color-outcome-loss)";
}

/**
 * Fixed, ordered hues for a "mixed" combo (some leagues won, some lost) —
 * distinct from the reserved win/loss green/red so a mixed outcome is never
 * mistaken for a clean sweep or a clean shutout. Plain, saturated, easily-
 * named colors (Tailwind's 500 step) rather than muted design-system
 * pastels, so each one reads clearly at a glance: blue, purple, orange,
 * yellow, pink, cyan. Assigned in this order as new combos are first
 * encountered scanning left→right (see computeComboBands); never reused for
 * a different combo within one card, never cycled once past the end.
 */
const MIXED_COMBO_COLORS = ["#3b82f6", "#a855f7", "#f97316", "#eab308", "#ec4899", "#06b6d4"];

/**
 * One color per DISTINCT combination of per-league win/loss for this
 * player — not per aggregate win count. "1 of 2 leagues won" is ambiguous
 * (could be either league); this instead answers "which one(s)," which is
 * what a reader actually wants from a card about a specific player's
 * specific leagues.
 *
 * Built from entry.recordBands (already correctly split at every pending
 * league's threshold) plus each resolved league's fixed, already-decided
 * result — every league, resolved or pending, gets a boolean in every
 * band's `combo`, ordered to match entry.leagues.
 */
function computeComboBands(
  entry: RemainingPlayerAnalysis,
): { min: number; max: number | null; combo: boolean[]; color: string }[] {
  const colorForCombo = new Map<string, string>();
  let nextMixedColor = 0;

  return entry.recordBands.map((band) => {
    // A point safely inside the band, mirroring computeRecordBands' own
    // convention — bands are constructed so the outcome is constant
    // throughout, but evaluating exactly AT an edge is ambiguous when that
    // edge is itself a threshold.
    const testScore = band.max != null ? (band.min + band.max) / 2 : band.min + Math.max(1, Math.abs(band.min) * 0.1);

    const combo = entry.leagues.map((l) => {
      if (l.resolved) return l.resolvedWin === true;
      const breakEven = l.breakEvenPoints ?? 0;
      return l.role === "your-starter" ? testScore >= breakEven : testScore <= breakEven;
    });

    const key = combo.join(",");
    let color = colorForCombo.get(key);
    if (!color) {
      if (combo.every(Boolean)) color = "var(--color-outcome-win)";
      else if (combo.every((w) => !w)) color = "var(--color-outcome-loss)";
      else {
        color = MIXED_COMBO_COLORS[nextMixedColor % MIXED_COMBO_COLORS.length];
        nextMixedColor++;
      }
      colorForCombo.set(key, color);
    }

    return { min: band.min, max: band.max, combo, color };
  });
}

/** SVG element ids can't safely contain the characters normalizePlayerKey's
 * keys or raw league ids might carry (spaces, "|", etc.) if they're going to
 * be referenced via url(#id). */
function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "-");
}

/** DEF/D-ST/DST — the position codes for a defense/special-teams unit, the
 * one player type whose real scoring can legitimately go negative. */
function isDefensePosition(position: string | null): boolean {
  const p = (position ?? "").toUpperCase();
  return p === "DST" || p === "DEF" || p === "D/ST";
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
 *
 * Also excludes any threshold that won't actually be plotted (a negative,
 * already-covered one, hidden per allowNegativeDisplay) — otherwise the
 * domain stretches to fit a marker that never gets drawn, squeezing every
 * threshold that DOES get shown into a sliver on one side of the chart.
 */
function computePlayerDomain(
  entry: RemainingPlayerAnalysis,
  allowNegativeDisplay: boolean,
): { min: number; max: number } {
  const pending = entry.leagues.filter(
    (l) => !l.resolved && (allowNegativeDisplay || (l.breakEvenPoints ?? 0) >= 0),
  );
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
  // A negative break-even is real math ("you're covered even at 0"), but a
  // skill player can't actually score below zero, so seeing "-4" reads as
  // confusing rather than informative. Defenses genuinely can go negative,
  // and so can anyone whose live score has already gone negative — for
  // everyone else, any negative threshold is hidden entirely (not shown as
  // a misleading "0" — see the dividers filter below) rather than displayed.
  const allowNegativeDisplay = isDefensePosition(entry.position) || entry.currentPoints < 0;
  const { min: domainMin, max: domainMax } = computePlayerDomain(entry, allowNegativeDisplay);
  const span = domainMax - domainMin;
  const total = entry.leagues.length;
  const pct = (x: number) =>
    ((Math.min(Math.max(x, domainMin), domainMax) - domainMin) / span) * 100;
  const isLive = entry.currentPoints > 0;
  const comboBands = computeComboBands(entry);
  const uniqueCombos = [...new Map(comboBands.map((b) => [b.combo.join(","), b])).values()];
  // Which legend swatch is currently clicked, if any — drives the win/loss
  // border painted onto the league badges below, so the legend's job is to
  // let you ask "what does THIS combo mean for each league" on demand
  // rather than spelling every combo out at once.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedCombo = uniqueCombos.find((b) => b.combo.join(",") === selectedKey)?.combo ?? null;

  // Resolved leagues are excluded — their threshold is retrospective, not
  // part of this "what should they do from here" axis, and with
  // computePlayerDomain also excluding them, plotting one here would sit
  // right at (or past) the domain edge, disconnected from the colored line.
  //
  // A negative, hidden-per-allowNegativeDisplay threshold is excluded too —
  // otherwise we'd draw a real box at its real (often far-off) position but
  // label it "0" because the true number is hidden, which is exactly the
  // "why is there a box sitting around zero" confusion: the box's position
  // and its label would no longer describe the same value. With nothing
  // honest left to show, skip the marker entirely instead.
  const rawDividers = entry.leagues
    .filter(
      (l) =>
        l.breakEvenPoints != null &&
        !l.resolved &&
        (allowNegativeDisplay || l.breakEvenPoints >= 0),
    )
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

      // The combo-band line normally cuts hard from one color to the next
      // right at a threshold — accurate when that threshold is exact, but
      // misleading when it's a range: the actual record could flip anywhere
      // across [leftX, rightX], not at one precise pixel. Computed for every
      // divider (not just non-exact ones) since a merged group below can mix
      // exact and non-exact members and needs every member's colors to
      // reconstruct the full sequence.
      const before = comboBands.find((b) => b.max === l.breakEvenPoints);
      const after = comboBands.find((b) => b.min === l.breakEvenPoints);
      const colorA = before?.color ?? after?.color ?? "var(--color-outcome-mid)";
      const colorB = after?.color ?? colorA;
      return { league: l, leftX, rightX, colorA, colorB };
    })
    .sort((a, b) => a.leftX - b.leftX);

  // When two thresholds' boxes touch or overlap, showing two separate
  // numbers under two separate (often visually colliding) boxes is more
  // confusing than useful — merge them into one box spanning the whole
  // cluster, with one number (the average of the merged thresholds) and a
  // stripe carrying every color the cluster spans, not just two.
  const MERGE_EPSILON = 0.01;
  const dividerGroups: (typeof rawDividers)[] = [];
  for (const d of rawDividers) {
    const openGroup = dividerGroups[dividerGroups.length - 1];
    const prev = openGroup?.[openGroup.length - 1];
    if (prev && d.leftX <= prev.rightX + MERGE_EPSILON) {
      openGroup.push(d);
    } else {
      dividerGroups.push([d]);
    }
  }

  const dividers = dividerGroups.map((members) => {
    const leftX = Math.min(...members.map((m) => m.leftX));
    const rightX = Math.max(...members.map((m) => m.rightX));
    const isSinglePoint = rightX - leftX < MERGE_EPSILON;
    // colorA, then each member's colorB in order — adjacent members' colors
    // chain (member[i].colorB === member[i+1].colorA) so this reconstructs
    // every distinct combo-band color the whole merged span crosses.
    const colors = [members[0].colorA, ...members.map((m) => m.colorB)];
    const avgBreakEven =
      members.reduce((sum, m) => sum + m.league.breakEvenPoints!, 0) / members.length;
    const key = members.map((m) => m.league.leagueId).join("+");
    return {
      key,
      leftX,
      rightX,
      centerX: (leftX + rightX) / 2,
      isSinglePoint,
      colors,
      avgBreakEven,
      patternId: isSinglePoint ? null : `stripe-${sanitizeId(entry.playerId)}-${sanitizeId(key)}`,
    };
  });

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="truncate text-sm font-medium">{entry.name}</p>
        <div className="flex flex-wrap justify-center gap-1">
          {entry.leagues.map((l, i) => {
            // Red/green here is reserved for ONE thing: the win/loss border
            // from the legend selection. Role identity (your starter vs.
            // opponent's) is carried entirely by the ↑/↓ glyph, with plain
            // neutral text — coloring the text red/green by role too would
            // have it fighting the border's red/green for the same two
            // colors, so a green-text/red-border (or vice versa) badge read
            // as contradictory instead of as two separate facts.
            // Same CSS vars as the chart/legend (not a separate Tailwind
            // class) so this can never drift out of sync with whatever
            // win/loss color those are set to.
            const borderColor = !selectedCombo
              ? "var(--color-border)"
              : selectedCombo[i]
              ? "var(--color-outcome-win)"
              : "var(--color-outcome-loss)";
            return (
              <span
                key={l.leagueId}
                title={l.description}
                className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold text-foreground transition-colors"
                style={{ borderColor }}
              >
                <span aria-hidden="true">{l.role === "your-starter" ? "↑" : "↓"}</span>
                {l.leagueName}
              </span>
            );
          })}
        </div>
      </div>
      <div className="relative h-6 w-full">
        <svg
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={`${entry.name}'s record across ${total} leagues as a function of their points, currently at ${entry.currentPoints.toFixed(1)}. Each distinct combination of which leagues win gets its own color, listed below the chart. Each threshold is drawn as a box that widens the more other unfinished starters could still move it, collapsing to a single line when this player is the last one left.`}
        >
          <defs>
            {dividers
              .filter((d) => d.patternId)
              .map((d) => {
                const n = d.colors.length;
                const unit = 1.2;
                return (
                  <pattern
                    key={d.patternId}
                    id={d.patternId!}
                    width={n * unit}
                    height={n * unit}
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    {d.colors.map((c, i) => (
                      <rect key={i} x={i * unit} width={unit} height={n * unit} fill={c} />
                    ))}
                  </pattern>
                );
              })}
          </defs>
          {comboBands.map((band, i) => (
            <line
              key={i}
              x1={pct(band.min)}
              y1={5}
              x2={pct(band.max ?? domainMax)}
              y2={5}
              stroke={band.color}
              strokeWidth={1.2}
            />
          ))}
          {/* Uncertain span gets a diagonal stripe carrying every combo
              color the merged box's range crosses (not just "before" and
              "after"), since the record could really flip anywhere across
              this width, not at one precise pixel. */}
          {dividers
            .filter((d) => d.patternId)
            .map((d) => (
              <rect
                key={`stripe-${d.key}`}
                x={d.leftX}
                y={4.4}
                width={d.rightX - d.leftX}
                height={1.2}
                fill={`url(#${d.patternId})`}
              />
            ))}
          {dividers.map((d) =>
            // Adjacent/overlapping thresholds are merged above into one box
            // (or, if every merged member individually collapsed to zero
            // width, one single bar) instead of several separate ones that
            // would otherwise visually collide.
            //
            // vectorEffect="non-scaling-stroke" on both: the svg's viewBox
            // is stretched non-uniformly (much wider than tall) to fill the
            // chart, so a plain strokeWidth renders horizontal edges
            // thinner than vertical ones (the same root cause as the
            // stretched-dot fix elsewhere in this file, just showing up in
            // line thickness instead of a circle's radius). This keeps
            // every edge — top, bottom, left, right — the same true pixel
            // width regardless of that stretch.
            d.isSinglePoint ? (
              <line
                key={`bar-${d.key}`}
                x1={d.leftX}
                y1={0}
                x2={d.leftX}
                y2={10}
                stroke="white"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <rect
                key={`box-${d.key}`}
                x={d.leftX}
                y={0.5}
                width={d.rightX - d.leftX}
                height={9}
                fill="none"
                stroke="white"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
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
        {dividers.map((d) => {
          // dividers already excludes any negative threshold that isn't
          // allowed to be shown, so this is always the real, honest value —
          // and, for a merged group, one number (the average of its
          // members) instead of several colliding ones.
          const displayValue = Math.round(d.avgBreakEven);
          return (
            <span
              key={`label-${d.key}`}
              // Only the "already covered" (negative) case gets colored —
              // same red as everywhere else (--color-outcome-loss). A
              // normal, still-actionable positive threshold is plain white,
              // not green; it's not calling out a good/bad outcome, just a
              // number.
              className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-medium leading-none text-white"
              style={{
                left: `${d.centerX}%`,
                color: displayValue < 0 ? "var(--color-outcome-loss)" : undefined,
              }}
            >
              {displayValue}
            </span>
          );
        })}
      </div>
      {/* Legend for the combo colors above — every card gets one, even a
          single-swatch one (so "there's only one possible outcome here" is
          itself shown, not just implied by an absent legend). Just the
          swatches; clicking one asks the league badges above "what does
          this combo mean for you," which answer by bordering themselves
          green/red, rather than the legend spelling out every league's
          outcome up front. */}
      <div className="flex flex-wrap justify-center gap-3">
        {uniqueCombos.map((band) => {
          const key = band.combo.join(",");
          const isSelected = key === selectedKey;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isSelected}
              title={entry.leagues
                .map((l, i) => `${l.leagueName}: ${band.combo[i] ? "win" : "loss"}`)
                .join(", ")}
              onClick={() => setSelectedKey((prev) => (prev === key ? null : key))}
              className="h-4 w-4 shrink-0 rounded-sm transition-shadow outline-none"
              style={{
                backgroundColor: band.color,
                // Same shape as a Tailwind ring-offset-2 + ring-2, but the
                // ring itself is this swatch's own color instead of a fixed
                // foreground white — a 2px card-colored gap, then a 2px
                // ring in band.color.
                boxShadow: isSelected
                  ? `0 0 0 2px var(--color-card), 0 0 0 4px ${band.color}`
                  : undefined,
              }}
            />
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
