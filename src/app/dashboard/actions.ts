"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues, platformIdentities } from "@/db/schema";
import {
  getSleeperLeaguesForUser,
  getSleeperNflState,
  getSleeperUserByUsername,
  sleeperAvatarUrl,
} from "@/lib/sleeper/client";

export type ConnectSleeperState = {
  error: string | null;
  success: string | null;
};

export async function connectSleeperAccount(
  _prevState: ConnectSleeperState,
  formData: FormData,
): Promise<ConnectSleeperState> {
  const username = String(formData.get("username") ?? "").trim();
  if (!username) return { error: "Enter a Sleeper username.", success: null };

  const session = await auth();
  if (!session?.user) return { error: "You must be logged in.", success: null };
  const userId = session.user.id;

  const sleeperUser = await getSleeperUserByUsername(username);
  if (!sleeperUser) {
    return {
      error: `No Sleeper user found for "${username}".`,
      success: null,
    };
  }

  const { season } = await getSleeperNflState();

  await db
    .insert(platformIdentities)
    .values({
      userId,
      platform: "sleeper",
      platformUserId: sleeperUser.user_id,
      platformUsername: sleeperUser.username,
    })
    .onConflictDoUpdate({
      target: [
        platformIdentities.userId,
        platformIdentities.platform,
        platformIdentities.platformUserId,
      ],
      set: { platformUsername: sleeperUser.username },
    });

  const leagues = await getSleeperLeaguesForUser(sleeperUser.user_id, season);

  if (leagues.length === 0) {
    return {
      error: null,
      success: `Connected as ${sleeperUser.display_name}, but no ${season} leagues were found.`,
    };
  }

  for (const league of leagues) {
    await db
      .insert(connectedLeagues)
      .values({
        userId,
        platform: "sleeper",
        platformLeagueId: league.league_id,
        platformUserId: sleeperUser.user_id,
        leagueName: league.name,
        season: league.season,
        sport: league.sport,
        avatarUrl: sleeperAvatarUrl(league.avatar),
      })
      .onConflictDoUpdate({
        target: [
          connectedLeagues.userId,
          connectedLeagues.platform,
          connectedLeagues.platformLeagueId,
        ],
        set: {
          leagueName: league.name,
          season: league.season,
          avatarUrl: sleeperAvatarUrl(league.avatar),
        },
      });
  }

  revalidatePath("/dashboard");
  return {
    error: null,
    success: `Imported ${leagues.length} league${leagues.length === 1 ? "" : "s"} for ${sleeperUser.display_name}.`,
  };
}

export async function removeConnectedLeague(leagueRowId: string) {
  const session = await auth();
  if (!session?.user) return;

  await db
    .delete(connectedLeagues)
    .where(
      and(
        eq(connectedLeagues.id, leagueRowId),
        eq(connectedLeagues.userId, session.user.id),
      ),
    );
  revalidatePath("/dashboard");
}
