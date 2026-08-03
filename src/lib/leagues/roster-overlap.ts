import { normalizeTeamAbbrev, type GameStatus } from "./nfl-schedule";
import type { LeagueMatchup } from "./types";

interface RosterPlayerInfo {
  name: string;
  position: string | null;
  proTeam: string | null;
  projectedPoints?: number;
  isStarter: boolean;
  isRookie?: boolean;
}

export interface LeagueRosterSet {
  leagueId: string;
  leagueName: string;
  /** The relevant team's display name (your team, or that week's opponent) — this is what should be shown to the user, not the league name. */
  teamName: string;
  platform: string;
  playerIds: Set<string>;
  players: Map<string, RosterPlayerInfo>;
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
export function normalizePlayerKey(name: string, position: string | null): string {
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
    const players = new Map<string, RosterPlayerInfo>();
    for (const p of team.players) {
      const key = normalizePlayerKey(p.name, p.position);
      playerIds.add(key);
      players.set(key, {
        name: p.name,
        position: p.position,
        proTeam: p.proTeam,
        projectedPoints: p.projectedPoints,
        isStarter: p.isStarter,
        isRookie: p.isRookie,
      });
    }
    sets.push({ leagueId, leagueName, teamName: team.name, platform, playerIds, players });
  }
  return sets;
}

export interface LeagueFingerprint {
  qb: number;
  wr: number;
  rb: number;
  bench: number;
  rookie: number;
  bye: number;
}

export const FINGERPRINT_AXES: { key: keyof LeagueFingerprint; label: string }[] = [
  { key: "qb", label: "QB" },
  { key: "wr", label: "WR" },
  { key: "rb", label: "RB" },
  { key: "bench", label: "Bench" },
  { key: "rookie", label: "Rookie" },
  { key: "bye", label: "Bye week" },
];

function fractionShared(matching: [string, RosterPlayerInfo][], otherIds: Set<string>): number {
  if (matching.length === 0) return 0;
  const shared = matching.filter(([id]) => otherIds.has(id)).length;
  return shared / matching.length;
}

function isPosition(p: RosterPlayerInfo, position: string): boolean {
  return (p.position ?? "").toUpperCase() === position;
}

/**
 * Each league's "fingerprint": what fraction of ITS roster in each category
 * (QB/WR/RB/bench/rookie/players on bye this week) also appears somewhere
 * else across your other leagues. One fingerprint per league — plot them
 * all on the same radar, distinguished by color, to see at a glance which
 * leagues are most entangled with the rest of your portfolio and in what way.
 *
 * Rookie detection currently only works for Sleeper rosters (years_exp data
 * isn't available from the ESPN wrapper this app uses) — ESPN players will
 * never count toward the rookie axis, so a league with only ESPN rosters
 * will always show 0% there regardless of its actual rookie count.
 */
export function computeLeagueFingerprints(
  sets: LeagueRosterSet[],
  statusByTeam: Map<string, GameStatus>,
): { leagueId: string; teamName: string; values: LeagueFingerprint }[] {
  return sets.map((mine, i) => {
    const otherIds = new Set<string>();
    sets.forEach((s, j) => {
      if (j === i) return;
      for (const id of s.playerIds) otherIds.add(id);
    });

    const entries = [...mine.players.entries()];
    const isByeThisWeek = (p: RosterPlayerInfo) =>
      statusByTeam.size > 0 && !statusByTeam.has(normalizeTeamAbbrev(p.proTeam));

    return {
      leagueId: mine.leagueId,
      teamName: mine.teamName,
      values: {
        qb: fractionShared(entries.filter(([, p]) => isPosition(p, "QB")), otherIds),
        wr: fractionShared(entries.filter(([, p]) => isPosition(p, "WR")), otherIds),
        rb: fractionShared(entries.filter(([, p]) => isPosition(p, "RB")), otherIds),
        bench: fractionShared(entries.filter(([, p]) => !p.isStarter), otherIds),
        rookie: fractionShared(entries.filter(([, p]) => p.isRookie === true), otherIds),
        bye: fractionShared(entries.filter(([, p]) => isByeThisWeek(p)), otherIds),
      },
    };
  });
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
