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
    /** Own-side contexts add, opponent-side subtract — a player on two opposing rosters compounds. */
    netValue: number;
    /** This player's signed projected contribution in each individual league they're rostered
     * in (own-side positive, opponent-side negative) — what each league chip shows. */
    leagueValues: Record<string, number>;
  }[];
}

type Side = "own" | "opponent" | "mix";

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

/** One style for every league chip — the "Filtering by" pills above the list and each
 * player's own league chips below it — so selecting a filter and seeing it reflected on a
 * card read as the same visual language. Selected state is a border outline rather than a
 * solid fill, so it stays legible without turning the whole list into a wall of bright color. */
function chipClassName(isOwn: boolean, isSelected: boolean): string {
  const tint = isOwn
    ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 dark:text-emerald-400"
    : "bg-red-500/15 text-red-600 hover:bg-red-500/25 dark:text-red-400";
  const border = isSelected ? (isOwn ? "border-emerald-500" : "border-red-500") : "border-transparent";
  return `border-2 ${border} ${tint}`;
}

export function VennExplorer({
  sets,
  combos,
}: {
  sets: VennSetInfo[];
  combos: VennComboInfo[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("all");

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

  function matches(selection: string[], leagueIds: string[]): boolean {
    return selection.every((id) => leagueIds.includes(id));
  }

  const matchingCombos =
    selected.length === 0 ? [] : overlapCombos.filter((c) => matches(selected, c.leagueIds));
  const matchingPlayerIds = new Set(matchingCombos.flatMap((c) => c.players.map((p) => p.id)));

  function toggle(leagueId: string) {
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

  const positions = Array.from(
    new Set(entries.map((e) => e.position).filter((p): p is string => !!p)),
  ).sort();

  const visible = sorted.filter((p) => {
    if (position !== "all" && p.position !== position) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
        >
          <option value="all">All positions</option>
          {positions.map((pos) => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </select>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtering by:</span>
          {selected.map((leagueId) => {
            const isOwn = sideById.get(leagueId) === "own";
            return (
              <button
                key={leagueId}
                type="button"
                onClick={() => toggle(leagueId)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${chipClassName(isOwn, true)}`}
              >
                {labelById.get(leagueId) ?? leagueId} ✕
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSelected([])}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No players match these filters.
        </p>
      ) : (
      <div className="grid gap-2 sm:grid-cols-2">
        {visible.map((p) => {
          const isFiltered = selected.length > 0 && !matchingPlayerIds.has(p.id);
          return (
            <div
              key={p.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.proTeam}</p>
                </div>
                <span
                  className={`shrink-0 text-2xl font-bold tabular-nums ${
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
                  // Only show a chip as "selected" on cards that actually satisfy every active
                  // filter together — a player who's only on Team A shouldn't have their Team A
                  // chip light up just because Team A is one of the filters, when Team B is too
                  // and this player isn't on Team B's roster.
                  const isSelected = selected.includes(leagueId) && !isFiltered;
                  const value = p.leagueValues[leagueId] ?? 0;
                  return (
                    <button
                      key={leagueId}
                      type="button"
                      onClick={() => toggle(leagueId)}
                      title={`Filter by ${label}`}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${chipClassName(isOwn, isSelected)}`}
                    >
                      <span>
                        {isOwn ? "↑" : "↓"} {label}
                      </span>
                      <span className="tabular-nums opacity-80">
                        {value > 0 ? "+" : ""}
                        {value.toFixed(1)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
