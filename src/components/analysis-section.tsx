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

type LeagueConflict = RemainingPlayerAnalysis["leagues"][number];

/** Points of "give" on either side of a league's breakeven threshold, from how many OTHER
 * starters (besides this player) could still swing it — 0 remaining collapses this to a
 * single sharp point; each additional one still to play widens it, capped so one league with a
 * pile of remaining starters doesn't stretch the shared axis for every other row. */
const WIDTH_PER_REMAINING = 5;
const MAX_REMAINING_FOR_WIDTH = 6;
function uncertaintyHalfWidth(remainingOthers: number): number {
  return Math.min(remainingOthers, MAX_REMAINING_FOR_WIDTH) * (WIDTH_PER_REMAINING / 2);
}

/** Rounds a span up to a "clean" tick step (5/10/15/20/25/50/100) so the shared axis reads
 * like a real ruler instead of an arbitrary fraction. */
function niceTickStep(span: number): number {
  const candidates = [5, 10, 15, 20, 25, 50, 100];
  return candidates.find((step) => span / step <= 8) ?? 100;
}

/** One shared axis for the whole table — every row's bars line up against the same points,
 * which is the only way a "consistent interval" reads as one ruler instead of N disconnected
 * mini-charts each making up its own scale. */
function computeSharedDomain(players: RemainingPlayerAnalysis[]): {
  min: number;
  max: number;
  step: number;
} {
  let min = 0;
  let max = 10;
  for (const p of players) {
    for (const l of p.leagues) {
      const center = l.breakEvenPoints ?? 0;
      const half = uncertaintyHalfWidth(l.remainingOthers);
      min = Math.min(min, center - half);
      max = Math.max(max, center + half);
    }
    max = Math.max(max, p.projectedPoints * 1.1, p.currentPoints + 4);
  }
  const step = niceTickStep(max - min);
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  return { min, max: max > min ? max : min + step, step };
}

/**
 * One league's contribution to a player's row, painted across the FULL shared axis (not just
 * its own threshold's neighborhood) so stacking several of these on the same row is what
 * produces the overlap: red/green everywhere, amber only in the zone the outcome genuinely
 * isn't decided yet. A wide amber zone (many other starters still to play) bleeds into — and
 * visually blends with — neighboring leagues' zones; a zero-width one (this player is the
 * last starter left anywhere that matters) is a single crisp cut between solid colors.
 */
function LeagueBarLayer({
  league,
  domainMin,
  domainMax,
}: {
  league: LeagueConflict;
  domainMin: number;
  domainMax: number;
}) {
  const span = domainMax - domainMin;
  const pct = (x: number) =>
    ((Math.min(Math.max(x, domainMin), domainMax) - domainMin) / span) * 100;

  const center = league.breakEvenPoints ?? 0;
  const half = uncertaintyHalfWidth(league.remainingOthers);
  const lowerPct = pct(center - half);
  const upperPct = pct(center + half);
  // "your-starter": low score loses (red), high score wins (green). "opp-starter": mirrored.
  const winsHigh = league.role === "your-starter";

  return (
    <>
      <div
        className={`absolute inset-y-0 left-0 ${winsHigh ? "bg-red-500/40" : "bg-emerald-500/40"}`}
        style={{ width: `${lowerPct}%` }}
      />
      {upperPct > lowerPct && (
        <div
          className="absolute inset-y-0 bg-amber-500/40"
          style={{ left: `${lowerPct}%`, width: `${upperPct - lowerPct}%` }}
        />
      )}
      <div
        className={`absolute inset-y-0 right-0 ${winsHigh ? "bg-emerald-500/40" : "bg-red-500/40"}`}
        style={{ left: `${upperPct}%` }}
      />
    </>
  );
}

function ConflictPlayerRow({
  entry,
  domainMin,
  domainMax,
}: {
  entry: RemainingPlayerAnalysis;
  domainMin: number;
  domainMax: number;
}) {
  const span = domainMax - domainMin;
  const pct = (x: number) =>
    ((Math.min(Math.max(x, domainMin), domainMax) - domainMin) / span) * 100;
  const isLive = entry.currentPoints > 0;

  return (
    <div className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0">
      <div className="w-32 shrink-0 sm:w-44">
        <p className="truncate text-sm font-medium">{entry.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {entry.position} · {entry.proTeam}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
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
      <div className="relative h-9 flex-1 overflow-hidden rounded-md bg-muted/30">
        {entry.leagues.map((l) => (
          <LeagueBarLayer key={l.leagueId} league={l} domainMin={domainMin} domainMax={domainMax} />
        ))}
        <div
          className="absolute inset-y-0 border-l-2 border-dashed border-foreground/60"
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
    </div>
  );
}

/** Table header's ruler — ticks at the same shared interval every row's bars line up against. */
function SharedAxisHeader({
  domainMin,
  domainMax,
  step,
}: {
  domainMin: number;
  domainMax: number;
  step: number;
}) {
  const ticks: number[] = [];
  for (let t = domainMin; t <= domainMax; t += step) ticks.push(t);
  const span = domainMax - domainMin;

  return (
    <div className="flex items-center gap-3 pb-1.5">
      <div className="w-32 shrink-0 sm:w-44" />
      <div className="relative h-4 flex-1">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute -translate-x-1/2 text-[10px] text-muted-foreground"
            style={{ left: `${((t - domainMin) / span) * 100}%` }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function ConflictPlayersTable({ players }: { players: RemainingPlayerAnalysis[] }) {
  const conflicted = players.filter((p) => p.hasConflict && p.leagues.length > 1);
  if (conflicted.length === 0) return null;

  const { min, max, step } = computeSharedDomain(conflicted);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Players you&apos;re rostering on both sides — your starter in one league, an
        opponent&apos;s starter in another. Red/green is the record if they land there; amber is
        still undecided. The more of this week&apos;s other starters are left to play, the wider
        that undecided zone is — it collapses to a sharp line once this player is the last one
        left anywhere it matters.
      </p>
      <div className="overflow-x-auto">
        <div className="min-w-[480px] rounded-xl border border-border bg-card p-3">
          <SharedAxisHeader domainMin={min} domainMax={max} step={step} />
          {conflicted.map((entry) => (
            <ConflictPlayerRow key={entry.playerId} entry={entry} domainMin={min} domainMax={max} />
          ))}
        </div>
      </div>
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
