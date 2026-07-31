import type { LeagueMatchup } from "./types";

export interface LeagueRosterSet {
  leagueId: string;
  leagueName: string;
  /** The relevant team's display name (your team, or that week's opponent) — this is what should be shown to the user, not the league name. */
  teamName: string;
  platform: string;
  playerIds: Set<string>;
  players: Map<
    string,
    { name: string; position: string | null; proTeam: string | null; projectedPoints?: number }
  >;
}

/**
 * ESPN and Sleeper hand out player IDs from entirely unrelated numbering
 * schemes, so the same real player never matches across platforms by raw ID
 * — a Sleeper league and an ESPN league can never show any overlap even if
 * they share half a roster. Matching by normalized name instead (lowercased,
 * accents stripped, suffixes like Jr./III dropped) is the one identifier
 * that's actually consistent across platforms.
 */
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Collapses platform-specific position spellings to one canonical form. */
function normalizePosition(position: string | null): string {
  const p = (position ?? "").toUpperCase().trim();
  if (p === "TQB") return "QB";
  if (p === "PK") return "K";
  if (p === "DEF" || p === "D/ST" || p === "DST") return "DST";
  return p;
}

/**
 * Name alone isn't a safe identity key — multiple real NFL players can share
 * an exact name (e.g. two different players named "Josh Allen": a
 * quarterback and a linebacker). Without position, those two get merged into
 * one "player" and their unrelated projections get summed/netted together,
 * producing a nonsense number. Position is cheap insurance against that: a
 * same-name collision within the same position is vanishingly rare.
 */
function normalizePlayerKey(name: string, position: string | null): string {
  return `${normalizeName(name)}|${normalizePosition(position)}`;
}

/**
 * Builds each league's roster player set (starters + bench) from a matchup.
 * `perspective: "own"` uses your own team; `"opponent"` uses this week's
 * opponent (leagues on a bye have no opponent and are skipped for that view).
 */
export function buildRosterSets(
  matchupResults: {
    leagueId: string;
    leagueName: string;
    platform: string;
    matchup: LeagueMatchup | null;
  }[],
  perspective: "own" | "opponent" = "own",
): LeagueRosterSet[] {
  const sets: LeagueRosterSet[] = [];
  for (const { leagueId, leagueName, platform, matchup } of matchupResults) {
    if (!matchup) continue;
    const team = perspective === "own" ? matchup.team : matchup.opponent;
    if (!team) continue;

    const playerIds = new Set<string>();
    const players = new Map<
      string,
      { name: string; position: string | null; proTeam: string | null; projectedPoints?: number }
    >();
    for (const p of team.players) {
      const key = normalizePlayerKey(p.name, p.position);
      playerIds.add(key);
      players.set(key, {
        name: p.name,
        position: p.position,
        proTeam: p.proTeam,
        projectedPoints: p.projectedPoints,
      });
    }
    sets.push({ leagueId, leagueName, teamName: team.name, platform, playerIds, players });
  }
  return sets;
}

export interface OverlapCombo {
  leagueIds: string[];
  playerIds: string[];
}

/**
 * Every non-empty EXCLUSIVE intersection combination across the given sets —
 * i.e. players in exactly this combination of leagues and no others. This is
 * exactly what a Venn diagram's regions (and an UpSet plot's rows) need.
 * Caps at 16 sets (2^16 masks, still fast) — callers should cap the league
 * list before calling for larger counts.
 */
export function computeOverlapCombos(sets: LeagueRosterSet[]): OverlapCombo[] {
  const n = Math.min(sets.length, 16);
  const combos: OverlapCombo[] = [];

  for (let mask = 1; mask < 1 << n; mask++) {
    const indices: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) indices.push(i);

    const [first, ...rest] = indices;
    let shared = [...sets[first].playerIds];
    for (const i of rest) {
      const s = sets[i].playerIds;
      shared = shared.filter((id) => s.has(id));
    }

    const others = Array.from({ length: n }, (_, i) => i).filter(
      (i) => !indices.includes(i),
    );
    const exclusive = shared.filter((id) => others.every((i) => !sets[i].playerIds.has(id)));

    if (exclusive.length > 0) {
      combos.push({ leagueIds: indices.map((i) => sets[i].leagueId), playerIds: exclusive });
    }
  }

  return combos.sort((a, b) => b.playerIds.length - a.playerIds.length);
}
