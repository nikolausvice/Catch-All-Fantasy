"use client";

import { useMemo, useState } from "react";
import type { RemainingPlayerAnalysis } from "@/lib/leagues/cross-league";

type Tone = "clear" | "solvable" | "unsolvable";

function getTone(p: RemainingPlayerAnalysis): Tone {
  if (!p.hasConflict) return "clear";
  // A conflict (starter in some of your leagues, opponent's starter in
  // others) does NOT automatically mean there's no way to satisfy both —
  // sweetSpot being non-null means a scoring range exists that wins
  // everywhere. Only the absence of a sweet spot is the "bad" case.
  return p.sweetSpot ? "solvable" : "unsolvable";
}

const CARD_TONE_STYLES: Record<Tone, string> = {
  clear: "border-border bg-card",
  solvable: "border-amber-500/30 bg-amber-500/5",
  unsolvable: "border-destructive/40 bg-destructive/5",
};

function RemainingCard({ p }: { p: RemainingPlayerAnalysis }) {
  const yourLeagues = p.leagues.filter((l) => l.role === "your-starter");
  const oppLeagues = p.leagues.filter((l) => l.role === "opp-starter");
  const tone = getTone(p);

  return (
    <div className={`rounded-xl border p-4 ${CARD_TONE_STYLES[tone]}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{p.name}</p>
          <p className="text-xs text-muted-foreground">
            {[p.position, p.proTeam].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold tabular-nums">{p.projectedPoints.toFixed(1)}</p>
          <p className="text-[10px] text-muted-foreground">proj pts</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {yourLeagues.map((l) => (
          <span
            key={l.leagueId}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
          >
            ↑ {l.leagueName}
          </span>
        ))}
        {oppLeagues.map((l) => (
          <span
            key={l.leagueId}
            className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive"
          >
            ↓ {l.leagueName}
          </span>
        ))}
      </div>

      {p.hasConflict && (
        <div
          className={`mb-3 rounded-lg px-3 py-2 text-sm ${
            tone === "solvable" ? "bg-amber-500/10" : "bg-destructive/10"
          }`}
        >
          {p.sweetSpot ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                Conflict — but there&apos;s a sweet spot
              </p>
              <p>
                <span className="font-bold text-foreground">
                  {p.sweetSpot.min.toFixed(1)}–{p.sweetSpot.max.toFixed(1)} pts
                </span>{" "}
                <span className="text-xs text-muted-foreground">
                  wins every league this player affects.
                </span>
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                Conflict — no safe zone
              </p>
              <p className="text-xs text-muted-foreground">
                Every possible score helps one league and hurts another — there&apos;s no number
                that wins both.
              </p>
            </>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-1">
        {[...yourLeagues, ...oppLeagues].map((l) => (
          <li key={l.leagueId} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{l.leagueName}:</span> {l.description}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StillPlayingSection({ players }: { players: RemainingPlayerAnalysis[] }) {
  const [search, setSearch] = useState("");
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [position, setPosition] = useState("all");
  const [league, setLeague] = useState("all");
  const [side, setSide] = useState<"all" | "yours" | "opponents">("all");

  const positions = useMemo(() => {
    const set = new Set<string>();
    for (const p of players) if (p.position) set.add(p.position);
    return Array.from(set).sort();
  }, [players]);

  const leagueNames = useMemo(() => {
    const set = new Set<string>();
    for (const p of players) for (const l of p.leagues) set.add(l.leagueName);
    return Array.from(set).sort();
  }, [players]);

  const filtered = players.filter((p) => {
    if (conflictsOnly && !p.hasConflict) return false;
    if (position !== "all" && p.position !== position) return false;
    if (league !== "all" && !p.leagues.some((l) => l.leagueName === league)) return false;
    if (side === "yours" && !p.leagues.some((l) => l.role === "your-starter")) return false;
    if (side === "opponents" && !p.leagues.some((l) => l.role === "opp-starter")) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (players.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No starters are still mid-game right now.
      </p>
    );
  }

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
        <select
          value={league}
          onChange={(e) => setLeague(e.target.value)}
          className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
        >
          <option value="all">All leagues</option>
          {leagueNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={side}
          onChange={(e) => setSide(e.target.value as "all" | "yours" | "opponents")}
          className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
        >
          <option value="all">Your team &amp; opponents</option>
          <option value="yours">Your team only</option>
          <option value="opponents">Opponents only</option>
        </select>
        <button
          type="button"
          onClick={() => setConflictsOnly((v) => !v)}
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            conflictsOnly
              ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          Conflicts only
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No players match these filters.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <RemainingCard key={p.playerId} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
