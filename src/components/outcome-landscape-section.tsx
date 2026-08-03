import type {
  OutcomeLandscape,
  OutcomeRegion,
  PlayerOutcomeLandscape,
} from "@/lib/leagues/outcome-landscape";

// Max half-width (as a % of axis width) that an uncertain boundary's color
// transition can soften into — this is what turns "certainty" into a visual
// blur: a certainty-1 boundary gets a hard edge (0% feather), a certainty-0
// boundary spreads its color change across this much of the bar.
const MAX_FEATHER_PCT = 9;

/** Wins → a status color along the app's existing win/loss scale (same tokens TeamRow uses), never the only signal — always paired with the record's text label. */
function regionColor(wins: number, total: number): string {
  const frac = total > 0 ? wins / total : 0;
  const destructivePct = Math.round((1 - frac) * 100);
  return `color-mix(in oklch, var(--color-destructive) ${destructivePct}%, var(--color-primary))`;
}

function pct(value: number, axisMax: number): number {
  return Math.max(0, Math.min(100, (value / axisMax) * 100));
}

function buildGradient(landscape: PlayerOutcomeLandscape, totalMatchups: number): string {
  const { regions, boundaries, axisRange } = landscape;
  const axisMax = axisRange.max;
  const stops: string[] = [];

  regions.forEach((region, i) => {
    const color = regionColor(region.wins, totalMatchups);
    const startPct = pct(region.min, axisMax);
    const endPct = region.max != null ? pct(region.max, axisMax) : 100;

    if (i === 0) stops.push(`${color} ${startPct}%`);

    if (i < regions.length - 1) {
      const boundary = boundaries[i];
      const feather = (1 - boundary.certainty) * MAX_FEATHER_PCT;
      const bPct = pct(boundary.at, axisMax);
      const nextColor = regionColor(regions[i + 1].wins, totalMatchups);
      stops.push(`${color} ${Math.max(startPct, bPct - feather)}%`);
      stops.push(`${nextColor} ${Math.min(100, bPct + feather)}%`);
    } else {
      stops.push(`${color} ${endPct}%`);
    }
  });

  return `linear-gradient(to right, ${stops.join(", ")})`;
}

function formatPts(min: number, max: number | null): string {
  const lo = Math.max(0, min).toFixed(1);
  if (max == null) return `${lo}+ pts`;
  return `${lo}–${Math.max(0, max).toFixed(1)} pts`;
}

function RegionChip({ region, axisMax }: { region: OutcomeRegion; axisMax: number }) {
  const widthPct = pct(region.max ?? axisMax, axisMax) - pct(region.min, axisMax);
  if (widthPct < 6) return null;
  return (
    <div
      className="flex flex-col items-center gap-0.5"
      style={{ flexBasis: `${widthPct}%`, flexGrow: 0, flexShrink: 0 }}
    >
      <span className="text-[11px] font-semibold">{region.label}</span>
      <span className="text-[10px] text-muted-foreground">
        {Math.round(region.probability * 100)}% likely
      </span>
    </div>
  );
}

function PlayerCard({
  player,
  totalMatchups,
}: {
  player: PlayerOutcomeLandscape;
  totalMatchups: number;
}) {
  const gradient = buildGradient(player, totalMatchups);
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
            confidencePct >= 85
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground"
          }`}
          title="How locked-in this player's outcome landscape already is, based on how many other players across your portfolio are still unresolved."
        >
          {confidencePct}% locked in
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          className="h-3 w-full rounded-full"
          style={{ background: gradient }}
          role="img"
          aria-label={`Outcome regions from ${player.regions[0]?.label} to ${
            player.regions[player.regions.length - 1]?.label
          } as ${player.name}'s performance increases from 0 to ${player.axisRange.max}x their projection.`}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0x proj</span>
          <span>{player.axisRange.max}x proj</span>
        </div>
        <div className="flex">
          {player.regions.map((region, i) => (
            <RegionChip key={i} region={region} axisMax={player.axisRange.max} />
          ))}
        </div>
      </div>

      {player.optimalRange && player.optimalRange.spans.length > 0 && (
        <div className="rounded-lg bg-muted/50 p-2.5 text-xs">
          <p className="font-medium">Best case: {player.optimalRange.achieves}</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
            {player.optimalRange.spans.map((span, i) => (
              <li key={i}>
                {span.perLeague
                  .map((l) => `${l.leagueName} ${formatPts(l.min, l.max)}`)
                  .join(" · ")}
              </li>
            ))}
          </ul>
        </div>
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
        week and the portfolio record it produces — soft edges mean other
        unfinished players could still shift that boundary, sharp edges mean
        it&apos;s locked in.
      </p>
      {landscape.players.map((player) => (
        <PlayerCard key={player.playerId} player={player} totalMatchups={landscape.totalMatchups} />
      ))}
    </div>
  );
}
