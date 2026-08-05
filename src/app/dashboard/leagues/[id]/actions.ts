"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues } from "@/db/schema";
import type { GameStatus } from "@/lib/leagues/nfl-schedule";
import {
  clearAllScoreOverrides,
  clearScoreOverride,
  setGameStatusOverride,
  setScoreOverride,
} from "@/lib/leagues/score-overrides";

export async function setUserTeam({
  leagueRowId,
  teamId,
  teamName,
}: {
  leagueRowId: string;
  teamId: string;
  teamName: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("You must be logged in.");

  await db
    .update(connectedLeagues)
    .set({ userTeamId: teamId, userTeamName: teamName })
    .where(
      and(
        eq(connectedLeagues.id, leagueRowId),
        eq(connectedLeagues.userId, session.user.id),
      ),
    );

  revalidatePath(`/dashboard/leagues/${leagueRowId}`);
  revalidatePath(`/dashboard/leagues/${leagueRowId}/select-team`);
  revalidatePath("/dashboard");
}

/**
 * Hand-tune a player's score from the demo editor. Stored as an override
 * keyed by normalized name + position (not this league's own player id), so
 * the edit applies everywhere that same real-world player is rostered —
 * other demo leagues, and real Sleeper/ESPN leagues too — not just this one
 * league's stored roster.
 */
export async function updateDemoScores(
  leagueRowId: string,
  updates: { name: string; position: string | null; points: number }[],
) {
  const session = await auth();
  if (!session?.user) throw new Error("You must be logged in.");

  const league = await db.query.connectedLeagues.findFirst({
    where: and(
      eq(connectedLeagues.id, leagueRowId),
      eq(connectedLeagues.userId, session.user.id),
    ),
  });
  if (!league || league.platform !== "demo") return;

  for (const u of updates) {
    if (!Number.isFinite(u.points)) continue;
    await setScoreOverride(session.user.id, u.name, u.position, u.points);
  }

  revalidatePath("/dashboard", "layout");
}

/**
 * Sets (or clears, with null) a player's explicit "is this player still
 * actively playing" flag from the demo editor — independent of their score,
 * so a scenario like "has points but still in progress" or "zero points but
 * done playing" can be constructed directly instead of only ever inferred
 * from the zero-points proxy. Same broadcast-by-identity behavior as
 * updateDemoScores: it reaches this real-world player everywhere they're
 * rostered, demo or real.
 */
export async function updateDemoGameStatus(
  leagueRowId: string,
  name: string,
  position: string | null,
  gameStatus: GameStatus | null,
) {
  const session = await auth();
  if (!session?.user) throw new Error("You must be logged in.");

  const league = await db.query.connectedLeagues.findFirst({
    where: and(
      eq(connectedLeagues.id, leagueRowId),
      eq(connectedLeagues.userId, session.user.id),
    ),
  });
  if (!league || league.platform !== "demo") return;

  await setGameStatusOverride(session.user.id, name, position, gameStatus);
  revalidatePath("/dashboard", "layout");
}

/** Reverts a single player back to whatever their real league (or the demo roster's own stored value) reports. */
export async function clearPlayerScoreOverride(name: string, position: string | null) {
  const session = await auth();
  if (!session?.user) throw new Error("You must be logged in.");

  await clearScoreOverride(session.user.id, name, position);
  revalidatePath("/dashboard", "layout");
}

/** Reverts every hand-typed demo score — every league goes back to being its own arbiter. */
export async function clearAllPlayerScoreOverrides() {
  const session = await auth();
  if (!session?.user) throw new Error("You must be logged in.");

  await clearAllScoreOverrides(session.user.id);
  revalidatePath("/dashboard", "layout");
}
