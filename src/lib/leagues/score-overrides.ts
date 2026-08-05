import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { playerScoreOverrides } from "@/db/schema";
import type { GameStatus } from "./nfl-schedule";
import { normalizePlayerKey } from "./roster-overlap";
import type { LeagueMatchup, LeagueTeam } from "./types";

export interface PlayerOverride {
  /** null = no points override for this player. */
  points: number | null;
  /** null = no gameStatus override; the player's status is inferred as usual. */
  gameStatus: GameStatus | null;
}

/** All of a user's active overrides, keyed by normalizePlayerKey(name, position). */
export async function getScoreOverrides(userId: string): Promise<Map<string, PlayerOverride>> {
  const rows = await db.query.playerScoreOverrides.findMany({
    where: eq(playerScoreOverrides.userId, userId),
  });
  return new Map(
    rows.map((r) => [
      r.playerKey,
      { points: r.points, gameStatus: r.gameStatus as GameStatus | null },
    ]),
  );
}

/**
 * Sets (or replaces) the points override for a real-world player, identified
 * by name + position. Leaves any existing gameStatus override on the same
 * row untouched — the two fields are independent.
 */
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

/**
 * Sets (or clears, with null) the gameStatus override for a real-world
 * player — the demo editor's "is this player still actively playing" flag,
 * which lets a scenario be constructed directly (points but still in
 * progress, zero points but done playing) instead of only ever inferred
 * from the zero-points proxy. Leaves any existing points override untouched.
 */
export async function setGameStatusOverride(
  userId: string,
  playerName: string,
  position: string | null,
  gameStatus: GameStatus | null,
): Promise<void> {
  const playerKey = normalizePlayerKey(playerName, position);
  if (gameStatus == null) {
    await db
      .update(playerScoreOverrides)
      .set({ gameStatus: null, updatedAt: new Date() })
      .where(
        and(eq(playerScoreOverrides.userId, userId), eq(playerScoreOverrides.playerKey, playerKey)),
      );
    return;
  }
  await db
    .insert(playerScoreOverrides)
    .values({ userId, playerKey, playerName, gameStatus })
    .onConflictDoUpdate({
      target: [playerScoreOverrides.userId, playerScoreOverrides.playerKey],
      set: { gameStatus, playerName, updatedAt: new Date() },
    });
}

/** Removes every override (points and gameStatus) for a player so the platform's own live data (or the demo roster's stored value) is authoritative again. */
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

function applyToTeam(
  team: LeagueTeam,
  overrides: Map<string, PlayerOverride>,
): { team: LeagueTeam; changed: boolean } {
  let changed = false;
  const players = team.players.map((p) => {
    const override = overrides.get(normalizePlayerKey(p.name, p.position));
    if (!override) return p;

    let next = p;
    if (override.points != null && override.points !== p.points) {
      next = { ...next, points: override.points };
      changed = true;
    }
    if (override.gameStatus != null && override.gameStatus !== p.gameStatus) {
      next = { ...next, gameStatus: override.gameStatus };
      changed = true;
    }
    return next;
  });
  return changed ? { team: { ...team, players }, changed } : { team, changed };
}

/**
 * Applies score/gameStatus overrides on top of an already-loaded matchup
 * (real or demo). Matched by normalized player identity, so an edit made in
 * the demo league reaches the same real-world player in every other league
 * — demo or real — they're rostered in. A no-op (returns the same object)
 * when nothing here is overridden, so callers can apply it unconditionally.
 */
export function applyScoreOverrides(
  matchup: LeagueMatchup,
  overrides: Map<string, PlayerOverride>,
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
