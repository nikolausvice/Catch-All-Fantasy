import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { playerScoreOverrides } from "@/db/schema";
import { normalizePlayerKey } from "./roster-overlap";
import type { LeagueMatchup, LeagueTeam } from "./types";

/** All of a user's active score overrides, keyed by normalizePlayerKey(name, position). */
export async function getScoreOverrides(userId: string): Promise<Map<string, number>> {
  const rows = await db.query.playerScoreOverrides.findMany({
    where: eq(playerScoreOverrides.userId, userId),
  });
  return new Map(rows.map((r) => [r.playerKey, r.points]));
}

/** Sets (or replaces) the override for a real-world player, identified by name + position. */
export async function setScoreOverride(
  userId: string,
  playerName: string,
  position: string | null,
  points: number,
): Promise<void> {
  const playerKey = normalizePlayerKey(playerName, position);
  await db
    .insert(playerScoreOverrides)
    .values({ userId, playerKey, playerName, points })
    .onConflictDoUpdate({
      target: [playerScoreOverrides.userId, playerScoreOverrides.playerKey],
      set: { points, playerName, updatedAt: new Date() },
    });
}

/** Removes an override so the platform's own live data (or the demo roster's stored value) is authoritative again. */
export async function clearScoreOverride(
  userId: string,
  playerName: string,
  position: string | null,
): Promise<void> {
  const playerKey = normalizePlayerKey(playerName, position);
  await db
    .delete(playerScoreOverrides)
    .where(
      and(eq(playerScoreOverrides.userId, userId), eq(playerScoreOverrides.playerKey, playerKey)),
    );
}

/** Removes every override for this user — hands every league back to its own live/stored data. */
export async function clearAllScoreOverrides(userId: string): Promise<void> {
  await db.delete(playerScoreOverrides).where(eq(playerScoreOverrides.userId, userId));
}

function teamScore(team: LeagueTeam): number {
  return team.players.filter((p) => p.isStarter).reduce((sum, p) => sum + (p.points ?? 0), 0);
}

function applyToTeam(team: LeagueTeam, overrides: Map<string, number>): { team: LeagueTeam; changed: boolean } {
  let changed = false;
  const players = team.players.map((p) => {
    const override = overrides.get(normalizePlayerKey(p.name, p.position));
    if (override == null || override === p.points) return p;
    changed = true;
    return { ...p, points: override };
  });
  return changed ? { team: { ...team, players }, changed } : { team, changed };
}

/**
 * Applies score overrides on top of an already-loaded matchup (real or
 * demo). Matched by normalized player identity, so a score edited in the
 * demo league reaches the same real-world player in every other league —
 * demo or real — they're rostered in. A no-op (returns the same object)
 * when nothing here is overridden, so callers can apply it unconditionally.
 */
export function applyScoreOverrides(
  matchup: LeagueMatchup,
  overrides: Map<string, number>,
): LeagueMatchup {
  if (overrides.size === 0) return matchup;

  const mine = applyToTeam(matchup.team, overrides);
  const opp = matchup.opponent ? applyToTeam(matchup.opponent, overrides) : null;
  if (!mine.changed && !opp?.changed) return matchup;

  return {
    ...matchup,
    team: mine.team,
    opponent: opp ? opp.team : matchup.opponent,
    teamScore: mine.changed ? teamScore(mine.team) : matchup.teamScore,
    opponentScore: opp?.changed ? teamScore(opp.team) : matchup.opponentScore,
  };
}
