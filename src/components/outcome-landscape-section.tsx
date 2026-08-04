import type { OutcomeLandscape, PlayerOutcomeLandscape } from "@/lib/leagues/outcome-landscape";

// SVG viewBox height (user units). Width is 0–100, standing in for % of the
// player's own points axis.
const CHART_H = 60;

// Max blur applied to the whole streamgraph when a player is least locked
// in overall — fades to 0 as confidence -> 1, layering a second, coarser
// cue for uncertainty on top of the band-spread itself.
const MAX_BLUR = 1.4;

/**
 * Wins → red (bad) / orange (split) / green (good), centered on orange
 * rather than blended straight red-to-green, so the midpoint reads as its
 * own deliberate color instead of a muddy transition.
 */
function bandColor(wins: number, total: number): string {
  const frac = total > 0 ? wins / total : 0.5;
  if (frac === 0.5) return "var(--color-outcome-mid)";
  if (frac > 0.5) {
    const winPct = Math.round((frac - 0.5) * 2 * 100);
    return `color-mix(in oklch, var(--color-outcome-win) ${winPct}%, var(--color-outcome-mid))`;
  }
  const lossPct = Math.round((0.5 - frac) * 2 * 100);
  return `color-mix(in oklch, var(--color-outcome-loss) ${lossPct}%, var(--color-outcome-mid))`;
}

/** Representative projection (avg across the player's leagues) used only to translate the calculation's internal 0–axisMax ratio into a points scale for display. */
function averageProjection(player: PlayerOutcomeLandscape): number {
  if (player.leagues.length === 0) return 0;
  const total = player.leagues.reduce((sum, l) => sum + l.projectedPoints, 0);
  return total / player.leagues.length;
}

/** Cardinal spline through the given points, as an SVG path fragment (no leading M) — turns the ~25 discrete grid samples into a flowing curve instead of a jagged polyline. */
function smoothLine(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  const tension = 0.2;
  let d = "";
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension * 3;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension * 3;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension * 3;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension * 3;
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)} `;
  }
  return d;
}

function PlayerStream({ player }: { player: PlayerOutcomeLandscape }) {
  const totalMatchups = player.leagues.length;
  const projection = averageProjection(player);
  const axisMax = player.axisRange.max;
  const maxPts = Math.round(axisMax * projection);
  const blurPx = (1 - player.confidence) * MAX_BLUR;

  const xFor = (r: number) => (r / axisMax) * 100;
  // Real win count in ascending order (0 at bottom/red .. total at top/green),
  // each sample's probability mass for that win count stacked cumulatively.
  const levels = Array.from({ length: totalMatchups + 1 }, (_, k) => k);

  const cumAt = (sampleIdx: number, upToLevel: number) => {
    const dist = player.samples[sampleIdx].distribution;
    let sum = 0;
    for (let k = 0; k <= upToLevel; k++) sum += dist[k] ?? 0;
    return sum;
  };

  const bandPath = (level: number) => {
    const top = player.samples.map((s, i) => ({ x: xFor(s.r), y: CHART_H - cumAt(i, level) * CHART_H }));
    const bottom = player.samples
      .map((s, i) => ({ x: xFor(s.r), y: CHART_H - cumAt(i, level - 1) * CHART_H }))
      .reverse();
    const start = top[0];
    return `M${start.x.toFixed(2)},${start.y.toFixed(2)} ${smoothLine(top)}L${bottom[0].x.toFixed(2)},${bottom[0].y.toFixed(2)} ${smoothLine(bottom)}Z`;
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{player.name}</p>
        <p className="text-xs text-muted-foreground">
          {player.position ?? "?"} · {player.proTeam ?? "FA"} ·{" "}
          {player.leagues.length} league{player.leagues.length === 1 ? "" : "s"}
        </p>
      </div>

      <svg
        viewBox={`0 0 100 ${CHART_H}`}
        preserveAspectRatio="none"
        className="h-16 w-full overflow-visible"
        role="img"
        aria-label={`Probability of each final record for ${player.name}'s ${totalMatchups} leagues as points scored go from 0 to ${maxPts}; wavier, more mixed color means other unfinished players could still change the outcome, flat and solid means it's locked in.`}
      >
        <g style={{ filter: blurPx > 0.15 ? `blur(${blurPx}px)` : undefined }}>
          {levels.map((level) => (
            <path key={level} d={bandPath(level)} fill={bandColor(level, totalMatchups)} />
          ))}
        </g>
      </svg>

      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0 pts</span>
        <span>{maxPts} pts</span>
      </div>
    </div>
  );
}

export function OutcomeLandscapeSection({ landscape }: { landscape: OutcomeLandscape }) {
  const players = landscape.players;

  if (landscape.totalMatchups === 0 || players.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No players left whose performance could still swing a matchup —
        check back once next week&apos;s games are set.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Players you own in one league who face you in another. Each band's
        thickness is the odds of that record at that many points — green on
        top is a winning record, red on the bottom is a losing one, orange
        in between is a split. A clean flat stack means it&apos;s decided;
        a mixed, wavy stack means other unfinished players could still tip
        it either way.
      </p>
      {players.map((player) => (
        <PlayerStream key={player.playerId} player={player} />
      ))}
    </div>
  );
}
