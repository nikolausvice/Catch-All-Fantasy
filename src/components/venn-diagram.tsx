"use client";

import { useState } from "react";

export interface VennSetInfo {
  leagueId: string;
  leagueName: string;
  size: number;
}

export interface VennComboInfo {
  leagueIds: string[];
  players: { id: string; name: string; position: string | null }[];
}

// Fixed categorical order — never reassigned by rank/filter.
const OWN_COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#84cc16", // lime-500
  "#f97316", // orange-500
  "#6366f1", // indigo-500
  "#14b8a6", // teal-500
];

// Fixed red/warm order for the opponents view — visually distinct from
// "your teams" so it always reads as "the other side."
const OPPONENT_COLORS = [
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#e11d48", // rose-600
  "#dc2626", // red-600
  "#f43f5e", // rose-500
  "#c2410c", // orange-700
  "#b91c1c", // red-700
  "#fb7185", // rose-400
  "#9f1239", // rose-800
  "#7c2d12", // orange-900
];

function comboKey(leagueIds: string[]): string {
  return [...leagueIds].sort().join("|");
}

function PlayerPanel({
  title,
  players,
  onClose,
}: {
  title: string;
  players: { id: string; name: string; position: string | null }[];
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      {players.length === 0 ? (
        <p className="text-xs text-muted-foreground">No players in this group.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {players.map((p) => (
            <span
              key={p.id}
              className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium"
            >
              {p.name}
              {p.position && (
                <span className="ml-1 text-muted-foreground">{p.position}</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Overlap matrix (UpSet-style — works for any number of leagues) ────────

function OverlapMatrix({
  sets,
  combos,
  colors,
}: {
  sets: VennSetInfo[];
  combos: VennComboInfo[];
  colors: string[];
}) {
  const [selected, setSelected] = useState<VennComboInfo | null>(null);
  const TOP_N = 15;
  const shown = combos.slice(0, TOP_N);
  const maxCount = Math.max(1, ...shown.map((c) => c.players.length));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4 text-xs">
        {sets.map((s, i) => (
          <span key={s.leagueId} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: colors[i % colors.length] }}
            />
            {s.leagueName} ({s.size})
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        {shown.map((combo) => (
          <button
            key={comboKey(combo.leagueIds)}
            type="button"
            onClick={() => setSelected(combo)}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left hover:bg-muted"
          >
            <div className="flex shrink-0 gap-1">
              {sets.map((s, i) => (
                <span
                  key={s.leagueId}
                  className={
                    combo.leagueIds.includes(s.leagueId)
                      ? "size-2.5 rounded-full"
                      : "size-2.5 rounded-full border border-border bg-transparent"
                  }
                  style={
                    combo.leagueIds.includes(s.leagueId)
                      ? { backgroundColor: colors[i % colors.length] }
                      : undefined
                  }
                />
              ))}
            </div>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${(combo.players.length / maxCount) * 100}%`,
                  backgroundColor: colors[0],
                }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums">
              {combo.players.length}
            </span>
          </button>
        ))}
      </div>
      {combos.length > TOP_N && (
        <p className="text-center text-xs text-muted-foreground">
          Showing top {TOP_N} of {combos.length} overlap groups.
        </p>
      )}

      {selected && (
        <PlayerPanel
          title={`${selected.leagueIds
            .map((id) => sets.find((s) => s.leagueId === id)?.leagueName)
            .join(" ∩ ")} (${selected.players.length})`}
          players={selected.players}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ── Single-perspective view ─────────────────────────────────────────────────

function OverlapView({
  sets,
  combos,
  colors,
}: {
  sets: VennSetInfo[];
  combos: VennComboInfo[];
  colors: string[];
}) {
  if (sets.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No active leagues for this view.
      </p>
    );
  }
  if (sets.length === 1) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Connect at least one more league to see roster overlap.
      </p>
    );
  }
  return <OverlapMatrix sets={sets} combos={combos} colors={colors} />;
}

// ── Entry point — perspective toggle + overlap view ────────────────────────

export function VennExplorer({
  ownSets,
  ownCombos,
  opponentSets,
  opponentCombos,
}: {
  ownSets: VennSetInfo[];
  ownCombos: VennComboInfo[];
  opponentSets: VennSetInfo[];
  opponentCombos: VennComboInfo[];
}) {
  const [perspective, setPerspective] = useState<"own" | "opponent">("own");
  const sets = perspective === "own" ? ownSets : opponentSets;
  const combos = perspective === "own" ? ownCombos : opponentCombos;
  const colors = perspective === "own" ? OWN_COLORS : OPPONENT_COLORS;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {(
          [
            { key: "own", label: "Your teams" },
            { key: "opponent", label: "This week's opponents" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setPerspective(opt.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              perspective === opt.key
                ? opt.key === "opponent"
                  ? "bg-red-500/15 text-red-600 shadow-sm dark:text-red-400"
                  : "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <OverlapView sets={sets} combos={combos} colors={colors} />
    </div>
  );
}
