"use client";

import { useState } from "react";

export interface VennSetInfo {
  leagueId: string;
  /** Display label — the relevant team's name (yours, or that week's opponent), not the league name. */
  label: string;
  size: number;
  side: "own" | "opponent";
}

export interface VennComboInfo {
  leagueIds: string[];
  players: {
    id: string;
    name: string;
    position: string | null;
    proTeam: string | null;
    /** Plain informational projection (the higher of the contexts this player appears in) — not signed. */
    projectedPoints: number;
    /** Own-side contexts add, opponent-side subtract — a player on two opposing rosters compounds. */
    netValue: number;
  }[];
}

type Side = "own" | "opponent" | "mix";

const SIDE_COLOR: Record<Side, string> = {
  own: "#22c55e", // green-500
  opponent: "#ef4444", // red-500
  mix: "#f59e0b", // amber-500
};
const GREY_COLOR = "#9ca3af"; // gray-400 — no overlap, or filtered out of the current selection

const SIDE_TEXT_CLASS: Record<Side, string> = {
  own: "text-emerald-600 dark:text-emerald-400",
  opponent: "text-red-600 dark:text-red-400",
  mix: "text-amber-600 dark:text-amber-400",
};

function comboSide(sideById: Map<string, "own" | "opponent">, leagueIds: string[]): Side {
  const sides = new Set(leagueIds.map((id) => sideById.get(id)));
  if (sides.has("own") && sides.has("opponent")) return "mix";
  return sides.has("own") ? "own" : "opponent";
}

export function VennExplorer({ sets, combos }: { sets: VennSetInfo[]; combos: VennComboInfo[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  const sideById = new Map(sets.map((s) => [s.leagueId, s.side]));
  const labelById = new Map(sets.map((s) => [s.leagueId, s.label]));
  const overlapCombos = combos.filter((c) => c.leagueIds.length >= 2);

  if (overlapCombos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No overlapping players yet — connect more leagues, or check back once matchups are set.
      </p>
    );
  }

  // Teams that appear in at least one overlap anywhere — everything else is
  // a permanently dead end and gets greyed out from the start.
  const teamsWithOverlap = new Set(overlapCombos.flatMap((c) => c.leagueIds));

  function matches(selection: string[], leagueIds: string[]): boolean {
    return selection.every((id) => leagueIds.includes(id));
  }

  const matchingCombos =
    selected.length === 0 ? [] : overlapCombos.filter((c) => matches(selected, c.leagueIds));
  const matchingPlayerIds = new Set(matchingCombos.flatMap((c) => c.players.map((p) => p.id)));

  // Would adding this candidate to the current selection still hit at least
  // one real combo? Used to grey out non-viable "next clicks" so the user is
  // steered toward selections that actually go somewhere.
  function isViableNext(leagueId: string): boolean {
    if (selected.includes(leagueId)) return true;
    const next = [...selected, leagueId];
    return overlapCombos.some((c) => matches(next, c.leagueIds));
  }

  function toggle(leagueId: string) {
    if (!teamsWithOverlap.has(leagueId)) return;
    setSelected((prev) =>
      prev.includes(leagueId) ? prev.filter((id) => id !== leagueId) : [...prev, leagueId],
    );
  }

  const seen = new Set<string>();
  const entries: (VennComboInfo["players"][number] & { side: Side; leagueIds: string[] })[] = [];
  for (const combo of overlapCombos) {
    const side = comboSide(sideById, combo.leagueIds);
    for (const p of combo.players) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      entries.push({ ...p, side, leagueIds: combo.leagueIds });
    }
  }

  // Highest net value to lowest by default; once a selection is active,
  // matching entries bubble to the top (still ordered by net value within
  // each group) instead of just losing their color in place.
  const sorted = entries.slice().sort((a, b) => {
    const aMatch = selected.length === 0 || matchingPlayerIds.has(a.id) ? 1 : 0;
    const bMatch = selected.length === 0 || matchingPlayerIds.has(b.id) ? 1 : 0;
    if (aMatch !== bMatch) return bMatch - aMatch;
    return b.netValue - a.netValue;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
        {sets.map((s) => {
          const hasOverlap = teamsWithOverlap.has(s.leagueId);
          const isSelected = selected.includes(s.leagueId);
          const viable = hasOverlap && (isSelected || isViableNext(s.leagueId));
          const color = hasOverlap ? SIDE_COLOR[s.side] : GREY_COLOR;

          return (
            <button
              key={s.leagueId}
              type="button"
              disabled={!hasOverlap}
              onClick={() => toggle(s.leagueId)}
              title={!hasOverlap ? `${s.label} — no overlap with any other team` : s.label}
              className={`flex min-h-11 items-center justify-center rounded-lg border-2 px-2 py-1.5 text-center text-xs font-semibold leading-tight outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                !hasOverlap
                  ? "cursor-not-allowed opacity-40"
                  : isSelected
                    ? "scale-[1.04] shadow-md"
                    : viable
                      ? ""
                      : "opacity-30"
              }`}
              style={{
                borderColor: color,
                backgroundColor: isSelected ? color : "transparent",
                color: isSelected ? "#fff" : color,
                boxShadow: isSelected
                  ? `0 0 0 3px var(--background), 0 0 0 5px ${color}80`
                  : undefined,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        {sorted.map((p) => {
          const isFiltered = selected.length > 0 && !matchingPlayerIds.has(p.id);
          const color = isFiltered ? GREY_COLOR : SIDE_COLOR[p.side];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.leagueIds)}
              className="flex flex-col gap-2 rounded-xl border-2 p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              style={{ borderColor: color, backgroundColor: `${color}26` }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.proTeam}
                    {p.projectedPoints > 0 && ` · ${p.projectedPoints.toFixed(1)} proj`}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-bold tabular-nums ${
                    isFiltered ? "text-muted-foreground" : SIDE_TEXT_CLASS[p.side]
                  }`}
                >
                  {p.netValue > 0 ? "+" : ""}
                  {p.netValue.toFixed(1)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.leagueIds.map((leagueId) => {
                  const isOwn = sideById.get(leagueId) === "own";
                  const label = labelById.get(leagueId) ?? leagueId;
                  return (
                    <span
                      key={leagueId}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isOwn
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-red-500/15 text-red-600 dark:text-red-400"
                      }`}
                    >
                      {isOwn ? "↑" : "↓"} {label}
                    </span>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
