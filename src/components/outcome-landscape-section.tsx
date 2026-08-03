import type { OutcomeLandscape, PlayerOutcomeLandscape } from "@/lib/leagues/outcome-landscape";

function pct(value: number, axisMax: number): number {
  return Math.max(0, Math.min(100, (value / axisMax) * 100));
}

function formatPts(min: number, max: number | null): string {
  const lo = Math.max(0, min).toFixed(1);
  if (max == null) return `${lo}+ pts`;
  return `${lo}–${Math.max(0, max).toFixed(1)} pts`;
}

/**
 * Which regions satisfy the player's optimal-range goal, by matching on
 * `min` — optimalRange.spans are built directly from a subset of `regions`
 * in the engine, so this is an exact match, not a heuristic.
 */
function optimalMins(player: PlayerOutcomeLandscape): Set<number> {
  return new Set((player.optimalRange?.spans ?? []).map((s) => s.min));
}

/**
 * A single continuous track, one block per region (touching, not gapped —
 * these are contiguous slices of one axis, not independent categories).
 * Only the region(s) matching the optimization goal get the app's existing
 * "winning" color; everything else stays neutral gray, exactly like
 * WinDistribution's bar chart — a full sequential ramp made adjacent
 * records (e.g. "3-1" vs "4-0") indistinguishable, so color is reserved for
 * "is this the target" rather than trying to encode the record itself.
 * "Lose All" regions get a destructive-tinted label as a standing warning
 * regardless of the goal. Boundary certainty is rendered as a literal CSS
 * blur on the tick mark between regions.
 */
function AxisTrack({ player }: { player: PlayerOutcomeLandscape }) {
  const { regions, boundaries, axisRange } = player;
  const axisMax = axisRange.max;
  const isOptimal = optimalMins(player);

  return (
    <div className="relative">
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {regions.map((region, i) => {
          const startPct = pct(region.min, axisMax);
          const endPct = region.max != null ? pct(region.max, axisMax) : 100;
          const widthPct = Math.max(endPct - startPct, 2);
          const optimal = isOptimal.has(region.min);
          return (
            <div
              key={i}
              className={optimal ? "bg-primary" : "bg-muted-foreground/25"}
              style={{ flexBasis: `${widthPct}%`, flexGrow: 0, flexShrink: 1 }}
              title={`${region.label} (${Math.round(region.probability * 100)}% likely in this range)`}
            />
          );
        })}
      </div>
      {boundaries.map((b, i) => (
        <div
          key={i}
          className="absolute top-0 h-3 w-0.5 bg-card"
          style={{
            left: `${pct(b.at, axisMax)}%`,
            filter: `blur(${(1 - b.certainty) * 2.5}px)`,
            opacity: 0.35 + b.certainty * 0.65,
          }}
          title={`${b.fromLabel} → ${b.toLabel} at ~${b.at.toFixed(2)}x projection (${Math.round(
            b.certainty * 100,
          )}% certain)`}
        />
      ))}
    </div>
  );
}

function RegionLabels({ player }: { player: PlayerOutcomeLandscape }) {
  const { regions, axisRange } = player;
  const axisMax = axisRange.max;
  const isOptimal = optimalMins(player);

  return (
    <div className="flex">
      {regions.map((region, i) => {
        const startPct = pct(region.min, axisMax);
        const endPct = region.max != null ? pct(region.max, axisMax) : 100;
        const widthPct = Math.max(endPct - startPct, 10);
        const optimal = isOptimal.has(region.min);
        return (
          <div
            key={i}
            className="min-w-0 truncate text-center"
            style={{ flexBasis: `${widthPct}%`, flexGrow: 0, flexShrink: 1 }}
          >
            <span
              className={`text-[11px] font-semibold ${
                optimal ? "text-primary" : region.wins === 0 ? "text-destructive" : "text-foreground"
              }`}
            >
              {region.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PlayerCard({ player }: { player: PlayerOutcomeLandscape }) {
  const confidencePct = Math.round(player.confidence * 100);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{player.name}</p>
          <p className="text-xs text-muted-foreground">
            {player.position ?? "?"} · {player.proTeam ?? "FA"} ·{" "}
            {player.leagues.length} league{player.leagues.length === 1 ? "" : "s"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            confidencePct >= 85 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}
          title="How locked-in this player's outcome landscape already is, based on how many other players across your portfolio are still unresolved."
        >
          {confidencePct}% locked in
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <AxisTrack player={player} />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0x proj</span>
          <span>{player.axisRange.max}x proj</span>
        </div>
        <RegionLabels player={player} />
      </div>

      {player.optimalRange && player.optimalRange.spans.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-primary">Target for {player.optimalRange.achieves}:</span>{" "}
          {player.optimalRange.spans
            .map((span) =>
              span.perLeague.map((l) => `${l.leagueName} ${formatPts(l.min, l.max)}`).join(" · "),
            )
            .join("  or  ")}
        </p>
      )}
    </div>
  );
}

export function OutcomeLandscapeSection({ landscape }: { landscape: OutcomeLandscape }) {
  if (landscape.totalMatchups === 0 || landscape.players.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No players left to simulate — check back once next week&apos;s games are set.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        For each remaining player, the range of what they could still do this
        week and the portfolio record it produces — the highlighted band is
        the target range; soft boundary lines mean other unfinished players
        could still shift them, sharp lines mean they&apos;re locked in.
      </p>
      {landscape.players.map((player) => (
        <PlayerCard key={player.playerId} player={player} />
      ))}
    </div>
  );
}
