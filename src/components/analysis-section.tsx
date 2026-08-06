"use client";

import Link from "next/link";
import { useState } from "react";
import type { CrossLeagueAnalysis, RemainingPlayerAnalysis } from "@/lib/leagues/cross-league";

/**
 * Eight basic colors, Outcomes-tab-only (WinDistribution/bandColor below
 * keeps the generic red/green CSS vars — it's an aggregate across every
 * league, not one player's own chart). Green/Red are the two outcomes that
 * matter most (a clean win, a clean loss) and are also the pair most
 * readers already associate with "good/bad," so they keep those roles; the
 * other six become the mixed-combo palette in MIXED_COMBO_COLORS below —
 * together that's the full set, none left over, none reused.
 */
const CARD_WIN_COLOR = "#22C55E"; // Green
const CARD_LOSS_COLOR = "#EF4444"; // Red

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
 * distinct from CARD_WIN_COLOR/CARD_LOSS_COLOR so a mixed outcome is never
 * mistaken for a clean sweep or a clean shutout. The remaining six of the
 * eight basic colors, ordered to alternate warm/cool (and pair rough
 * complements back-to-back — Blue/Orange, Purple/Yellow) so that whichever
 * two of these end up adjacent on a card, they read as clearly different
 * rather than two nearby shades of the same temperature. Light Blue sits
 * apart from Blue for the same reason: a hue shift toward cyan plus a big
 * jump in lightness, not just "a paler version of the same color." White is
 * pulled in slightly off pure white (#F1F5F9) so it stays distinguishable
 * from the chart's own always-white dot and box outline. Assigned in this
 * order as new combos are first encountered scanning left→right (see
 * computeComboBands); never reused for a different combo within one card. A
 * 7th distinct mixed combo on the same card — rare, needs 3+ pending
 * leagues splitting every possible way — cycles back to Blue rather than
 * growing further.
 */
const MIXED_COMBO_COLORS = [
  "#3B82F6", // Blue
  "#F97316", // Orange
  "#A855F7", // Purple
  "#EAB308", // Yellow
  "#38BDF8", // Light Blue
  "#F1F5F9", // White
];

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

    // Every league uses the same testScore comparison, resolved or not —
    // see the matching comment on computeRecordBands for why a resolved
    // league's breakEvenPoints is still a real (retrospective) threshold
    // rather than a fixed constant.
    const combo = entry.leagues.map((l) => {
      const breakEven = l.breakEvenPoints ?? 0;
      return l.role === "your-starter" ? testScore >= breakEven : testScore <= breakEven;
    });

    const key = combo.join(",");
    let color = colorForCombo.get(key);
    if (!color) {
      if (combo.every(Boolean)) color = CARD_WIN_COLOR;
      else if (combo.every((w) => !w)) color = CARD_LOSS_COLOR;
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

/** Hover text on the score chip — "Yet to play"/"Live"/"Final". */
function statusLabel(status: "pre" | "in" | "post"): string {
  if (status === "pre") return "Yet to play";
  if (status === "in") return "Live";
  return "Final";
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
 * Includes RESOLVED leagues' thresholds too, not just pending ones — a resolved league's
 * breakEvenPoints is retrospective ("what they needed") rather than actionable, but it's
 * still drawn (see the dividers filter below), so the axis needs room for it too, or it'd
 * get clamped to the domain edge and sit disconnected from where it actually belongs.
 *
 * Also excludes any threshold that won't actually be plotted (a negative,
 * already-covered one, hidden per allowNegativeDisplay) — otherwise the
 * domain stretches to fit a marker that never gets drawn, squeezing every
 * threshold that DOES get shown into a sliver on one side of the chart.
 */
function computePlayerDomain(
  entry: RemainingPlayerAnalysis,
  allowNegativeDisplay: boolean,
  isDefense: boolean,
): { min: number; max: number } {
  const relevant = entry.leagues.filter(
    (l) => l.breakEvenPoints != null && (allowNegativeDisplay || l.breakEvenPoints >= 0),
  );
  const breakEvens = relevant.map((l) => l.breakEvenPoints ?? 0);

  let min = 0;
  for (const be of breakEvens) min = Math.min(min, be);
  // The "how far right should this go by default" baseline (projection/
  // current-points headroom, no real threshold in play) is clamped to a
  // 20–70 window so cards stay roughly comparable at a glance instead of
  // one player's tiny 8-point range sitting next to another's 95-point
  // range — but a REAL threshold always wins over the clamp: breakEvens is
  // deliberately outside the Math.min/Math.max pair below, so a genuine
  // break-even past 70 still stretches the axis to show it rather than
  // getting silently clipped off-screen.
  const baselineMax = Math.min(70, Math.max(20, entry.projectedPoints * 1.1, entry.currentPoints + 4));
  let max = Math.max(baselineMax, ...breakEvens);
  if (max <= min) max = min + 10;

  // Pad — but ONLY the side that actually needs it, and only when it
  // actually needs it. If the highest/lowest threshold IS the domain's own
  // max/min (no natural headroom from the projection/current-points margins
  // above), the color band beyond it would be computed correctly but have
  // zero pixels left to draw in. A player with no pending threshold at all
  // (nothing above beyond the flat `10` floor) has nothing at risk of that
  // collision, so it's left untouched — padding both ends unconditionally
  // for every card meant a threshold-free card got an arbitrary gap it
  // never needed, at the exact "start of the line" where nothing was ever
  // wrong to begin with.
  if (breakEvens.length > 0) {
    const pad = Math.max((max - min) * 0.12, 3);
    if (Math.max(...breakEvens) >= max) max += pad;
    if (Math.min(...breakEvens) <= min) {
      // A defense can realistically score deep negative (points-allowed
      // penalties stack up fast), so a real negative threshold for one gets
      // real headroom to match — not just the same small pad every other
      // position gets. But -20 is a HARD cap, not a "extend further if the
      // real number is more extreme" baseline like the max side: an actual
      // computed threshold past -20 is a projection-math artifact, not a
      // realistic score, so it gets clamped to sit right at the axis edge
      // (pct() already clamps the divider itself) instead of stretching the
      // whole card to make room for a number nobody will actually see hit.
      min = isDefense ? Math.max(min - pad, -20) : min - pad;
    }
  }
  return { min, max };
}

function PlayerOutcomeCard({ entry }: { entry: RemainingPlayerAnalysis }) {
  // A negative break-even is real math ("you're covered even at 0"), but a
  // skill player can't actually score below zero, so seeing "-4" reads as
  // confusing rather than informative. Defenses genuinely can go negative,
  // and so can anyone whose live score has already gone negative — for
  // everyone else, any negative threshold is hidden entirely (not shown as
  // a misleading "0" — see the dividers filter below) rather than displayed.
  const isDefense = isDefensePosition(entry.position);
  const allowNegativeDisplay = isDefense || entry.currentPoints < 0;
  const { min: domainMin, max: domainMax } = computePlayerDomain(entry, allowNegativeDisplay, isDefense);
  const span = domainMax - domainMin;
  const total = entry.leagues.length;
  const pct = (x: number) =>
    ((Math.min(Math.max(x, domainMin), domainMax) - domainMin) / span) * 100;
  // Inverse of pct — turns a box edge's chart-percent position back into a
  // real points value, for labeling the box's actual start/end rather than
  // just its (already-known) center threshold.
  const unpct = (x: number) => domainMin + (x / 100) * span;
  const comboBands = computeComboBands(entry);
  // Only combos that actually occupy visible width on THIS card's own
  // (possibly negative-threshold-excluding) domain — computeRecordBands
  // works off the real, unbounded breakEven values, so a band that sits
  // entirely outside [domainMin, domainMax] (e.g. split off by a hidden
  // negative threshold) is real but invisible once clamped through pct().
  // Without this, the legend could show a swatch for a color that never
  // actually appears anywhere on the line.
  const visibleComboBands = comboBands.filter((b) => pct(b.max ?? domainMax) > pct(b.min));
  const uniqueCombos = [...new Map(visibleComboBands.map((b) => [b.combo.join(","), b])).values()];
  // Which legend swatch is currently clicked, if any — drives the win/loss
  // border painted onto the league badges below, so the legend's job is to
  // let you ask "what does THIS combo mean for each league" on demand
  // rather than spelling every combo out at once.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedCombo = uniqueCombos.find((b) => b.combo.join(",") === selectedKey)?.combo ?? null;

  // Resolved leagues are included, not skipped — their threshold is
  // retrospective ("what they needed, holding everyone else's actual final
  // score fixed") rather than actionable, but it's still real information
  // worth showing on the line. isExact is already true for every resolved
  // league (nothing else left uncertain — see leagueResolved in
  // cross-league.ts), so halfWidth below collapses it to a plain bar
  // automatically: a resolved league's retrospective marker is always a
  // line, never a box, without needing any special-casing here.
  //
  // A negative, hidden-per-allowNegativeDisplay threshold is excluded —
  // otherwise we'd draw a real marker at its real (often far-off) position
  // but label it "0" because the true number is hidden, which is exactly
  // the "why is there a marker sitting around zero" confusion: its position
  // and its label would no longer describe the same value. With nothing
  // honest left to show, skip the marker entirely instead.
  const rawDividers = entry.leagues
    .filter((l) => l.breakEvenPoints != null && (allowNegativeDisplay || l.breakEvenPoints >= 0))
    .map((l) => {
      const x = pct(l.breakEvenPoints!);
      // Uncertainty as width instead of a percentage — one standard
      // deviation (remainingSd, in points, converted to this card's own
      // percent-of-axis scale) of every OTHER still-unfinished starter's
      // (either side) combined projection variance, not just a headcount
      // of how many there are. A league whose only other starter left is a
      // boom/bust WR1 gets a visibly wider box than one where it's a
      // low-ceiling kicker, even though "remainingOthers" would be 1 in
      // both cases. Capped so one outlier-variance league can't swallow the
      // whole card; a lone remaining starter (isExact) still collapses to
      // zero width, drawn as a single bar instead of a box.
      const halfWidth = l.isExact ? 0 : Math.min(15, (l.remainingSd / span) * 100);
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
    const key = members.map((m) => m.league.leagueId).join("+");
    return {
      key,
      leftX,
      rightX,
      centerX: (leftX + rightX) / 2,
      // The box's actual start/end in points, not just its center threshold
      // — lets a reader see the real range this could still land in, rather
      // than a single number that implies more precision than the box
      // itself is showing. Also what a single-point (isExact) divider's own
      // label reads from — never the raw breakEvenPoints, which can sit past
      // a domain cap (e.g. a defense's -20 floor) that this position, being
      // derived from the already-clamped leftX/rightX, correctly respects.
      leftPoints: unpct(leftX),
      rightPoints: unpct(rightX),
      isSinglePoint,
      colors,
      patternId: isSinglePoint ? null : `stripe-${sanitizeId(entry.playerId)}-${sanitizeId(key)}`,
    };
  });

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card p-4">
      <p className="truncate text-center text-sm font-medium">{entry.name}</p>
      {/* Current score, averaged across leagues already (entry.currentPoints).
          Plain chip, not colored by outcome — a white border, same as the
          dot/box-outline elsewhere on this card. A row of its own (not an
          overlay on the dot) is also what buys the breathing room between
          the name and the chart. */}
      <div className="flex justify-center">
        <span
          className="inline-flex items-center rounded-full border-2 border-white px-2 py-0.5 text-xs font-bold text-foreground"
          title={statusLabel(entry.status)}
        >
          {Math.round(entry.currentPoints)}
        </span>
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
              // The last band already falls back to domainMax when its own
              // max is null (open-ended) — the first band needs the same
              // fallback on its min, or a widened domain (e.g. the -20
              // defense floor) leaves a blank gap between the true axis
              // edge and wherever this band's own raw threshold happens to
              // start, instead of that color simply filling the gap.
              x1={pct(i === 0 ? domainMin : band.min)}
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
            on any screen wider than it is tall.
            Always shown — pregame, live, or final all have a real
            currentPoints value worth marking (0 before kickoff is still a
            real point on the axis, not "nothing to show"). */}
        <div
          className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
          style={{ left: `${pct(entry.currentPoints)}%` }}
        />
      </div>
      <div className="relative h-4 w-full">
        {dividers.flatMap((d) => {
          // A single-point divider (isExact, zero-width) has nothing to
          // range over — one centered number, same as before. A real box
          // gets ITS ACTUAL start and end labeled instead of one number at
          // the center, so the range the record could still flip across is
          // visible, not just implied by the box's width.
          if (d.isSinglePoint) {
            const displayValue = Math.round(d.leftPoints);
            return [
              <span
                key={`label-${d.key}`}
                // Only the "already covered" (negative) case gets colored —
                // same CARD_LOSS_COLOR as everywhere else on this page. A
                // normal, still-actionable positive threshold is plain
                // white, not the win color; it's not calling out a good/bad
                // outcome, just a number.
                className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-medium leading-none text-white"
                style={{
                  left: `${d.centerX}%`,
                  color: displayValue < 0 ? CARD_LOSS_COLOR : undefined,
                }}
              >
                {displayValue}
              </span>,
            ];
          }
          const startValue = Math.round(d.leftPoints);
          const endValue = Math.round(d.rightPoints);
          return [
            <span
              key={`label-start-${d.key}`}
              className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-medium leading-none text-white"
              style={{
                left: `${d.leftX}%`,
                color: startValue < 0 ? CARD_LOSS_COLOR : undefined,
              }}
            >
              {startValue}
            </span>,
            <span
              key={`label-end-${d.key}`}
              className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-medium leading-none text-white"
              style={{
                left: `${d.rightX}%`,
                color: endValue < 0 ? CARD_LOSS_COLOR : undefined,
              }}
            >
              {endValue}
            </span>,
          ];
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
      <div className="flex flex-wrap justify-center gap-1">
        {entry.leagues.map((l, i) => {
          // Red/green here is reserved for ONE thing: the win/loss border
          // from the legend selection — plain neutral text otherwise.
          // Coloring the text red/green by role too would have it fighting
          // the border's red/green for the same two colors, so a
          // green-text/red-border (or vice versa) badge read as
          // contradictory instead of as two separate facts.
          // Same fixed CARD_WIN_COLOR/CARD_LOSS_COLOR as the chart/legend
          // above (not a separate Tailwind class) so this can never drift
          // out of sync with whatever those are set to.
          const borderColor = !selectedCombo
            ? "var(--color-border)"
            : selectedCombo[i]
            ? CARD_WIN_COLOR
            : CARD_LOSS_COLOR;
          return (
            <Link
              key={l.leagueId}
              href={`/dashboard/leagues/${l.leagueId}`}
              className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold text-foreground transition-colors hover:bg-muted"
              style={{ borderColor }}
            >
              {l.leagueName}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Lives on the Overview tab, not Outcomes — it's a summary of the whole
 * week's shape ("how many of your leagues do you end up winning"), not
 * something that needs to sit next to the per-player conflict cards it used
 * to be paired with. */
export function WinScenariosSection({
  winCountDistribution,
}: {
  winCountDistribution: number[] | null;
}) {
  if (!winCountDistribution) return null;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Win scenarios
      </h2>
      <WinDistribution distribution={winCountDistribution} />
    </div>
  );
}

function PlayerOutcomesSection({
  players,
}: {
  players: RemainingPlayerAnalysis[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {players.map((entry) => (
        <PlayerOutcomeCard key={entry.playerId} entry={entry} />
      ))}
    </div>
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

  if (analysis.remainingPlayers.length === 0) return null;

  return <PlayerOutcomesSection players={analysis.remainingPlayers} />;
}
