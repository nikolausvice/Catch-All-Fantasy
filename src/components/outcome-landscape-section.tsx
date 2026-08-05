import type { OutcomeLandscape, PlayerOutcomeLandscape } from "@/lib/leagues/outcome-landscape";

// SVG viewBox height (user units). Width is 0–100, standing in for % of the
// player's own points axis.
const CHART_H = 10;
const LINE_Y = CHART_H / 2;

// A boundary below this certainty is drawn dotted rather than solid — exactly
// 1 only when no other unresolved players anywhere could still shift it.
const SOLID_CERTAINTY_THRESHOLD = 0.999;

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

/**
 * Every league has its own projection for this player (different provider/
 * scoring settings), so a single averaged points axis mislabels the real
 * threshold in any specific league. Instead, each boundary's ratio is
 * converted back to points separately per league it affects — the same
 * number already used to build `optimalRange`, just surfaced for every
 * boundary instead of only the optimal spans.
 */
function pointsForLeague(r: number, league: { projectedPoints: number }): number {
  return Math.round(r * league.projectedPoints);
}

function PlayerLine({ player }: { player: PlayerOutcomeLandscape }) {
  const totalMatchups = player.leagues.length;
  const axisMax = player.axisRange.max;
  const currentPts = Math.round(player.currentPoints);

  const xFor = (r: number) => (r / axisMax) * 100;
  const dotX = xFor(player.currentR);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
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
        className="h-6 w-full overflow-visible"
        role="img"
        aria-label={`${player.name}'s outcome margin across ${totalMatchups} leagues, currently at ${currentPts} points. Red means a losing record, green a winning one, orange a split. Dotted dividers mean other unfinished players could still move the threshold; solid dividers are locked in.`}
      >
        {player.regions.map((region, i) => (
          <line
            key={i}
            x1={xFor(region.min)}
            y1={LINE_Y}
            x2={xFor(region.max ?? axisMax)}
            y2={LINE_Y}
            stroke={bandColor(region.wins, totalMatchups)}
            strokeWidth={1.6}
          />
        ))}

        {player.boundaries.map((boundary, i) => {
          const x = xFor(boundary.at);
          const solid = boundary.certainty >= SOLID_CERTAINTY_THRESHOLD;
          return (
            <line
              key={i}
              x1={x}
              y1={0}
              x2={x}
              y2={CHART_H}
              stroke="var(--color-foreground)"
              strokeOpacity={0.45}
              strokeWidth={0.5}
              strokeDasharray={solid ? undefined : "0.8,1"}
            />
          );
        })}

        <circle
          cx={dotX}
          cy={LINE_Y}
          r={1.6}
          fill="var(--color-foreground)"
          stroke="var(--color-card)"
          strokeWidth={0.6}
        />
      </svg>

      {player.boundaries.length > 0 && (
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {player.boundaries.map((boundary, i) => (
            <p key={i} className="truncate">
              <span className="font-medium">{boundary.fromLabel}</span>
              {" → "}
              <span className="font-medium">{boundary.toLabel}</span>
              {": "}
              {player.leagues
                .map((l) => `${l.leagueName} ${pointsForLeague(boundary.at, l)} pts`)
                .join(" · ")}
            </p>
          ))}
        </div>
      )}
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
        Players you own in one league who face you in another. The line is
        your record across the axis of points they could still score — green
        is a winning record, red a losing one, orange a split. The dot marks
        their current points; solid dividers are locked in, dotted ones could
        still move if other unfinished players swing the outcome.
      </p>
      {players.map((player) => (
        <PlayerLine key={player.playerId} player={player} />
      ))}
    </div>
  );
}
