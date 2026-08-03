import type { CrossLeagueAnalysis } from "@/lib/leagues/cross-league";

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
        </Section>
      )}
    </div>
  );
}
