import type { LeagueMatchup } from "./types";

export interface LeagueRosterSet {
  leagueId: string;
  leagueName: string;
  platform: string;
  playerIds: Set<string>;
  players: Map<string, { name: string; position: string | null; proTeam: string | null }>;
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
      { name: string; position: string | null; proTeam: string | null }
    >();
    for (const p of team.players) {
      playerIds.add(p.id);
      players.set(p.id, { name: p.name, position: p.position, proTeam: p.proTeam });
    }
    sets.push({ leagueId, leagueName, platform, playerIds, players });
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
 * Caps at 10 sets (2^10 masks) — callers should cap the league list before
 * calling for larger counts.
 */
export function computeOverlapCombos(sets: LeagueRosterSet[]): OverlapCombo[] {
  const n = Math.min(sets.length, 10);
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
