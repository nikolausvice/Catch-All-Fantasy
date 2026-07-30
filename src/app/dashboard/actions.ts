"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues, platformIdentities } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto/secrets";
import { EspnApiError, getEspnLeagueInfo } from "@/lib/espn/client";
import { requireSessionUserId, STALE_SESSION_MESSAGE } from "@/lib/auth/require-user";
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

  const userId = await requireSessionUserId();
  if (!userId) return { error: STALE_SESSION_MESSAGE, success: null };

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

export type ConnectEspnState = {
  error: string | null;
  success: string | null;
};

export async function connectEspnAccount(
  _prevState: ConnectEspnState,
  formData: FormData,
): Promise<ConnectEspnState> {
  const leagueIdRaw = String(formData.get("leagueId") ?? "").trim();
  const seasonRaw = String(formData.get("season") ?? "").trim();
  const espnS2 = String(formData.get("espnS2") ?? "").trim();
  const swid = String(formData.get("swid") ?? "").trim();

  const leagueId = Number(leagueIdRaw);
  const season = Number(seasonRaw);

  if (!leagueIdRaw || !Number.isInteger(leagueId) || leagueId <= 0) {
    return { error: "Enter a valid ESPN league ID.", success: null };
  }
  if (!seasonRaw || !Number.isInteger(season)) {
    return { error: "Enter a valid season year.", success: null };
  }
  if ((espnS2 && !swid) || (!espnS2 && swid)) {
    return {
      error: "Enter both the espn_s2 and SWID cookies, or leave both blank.",
      success: null,
    };
  }

  const userId = await requireSessionUserId();
  if (!userId) return { error: STALE_SESSION_MESSAGE, success: null };

  let league;
  try {
    league = await getEspnLeagueInfo({
      leagueId,
      seasonId: season,
      espnS2: espnS2 || undefined,
      swid: swid || undefined,
    });
  } catch (err) {
    if (err instanceof EspnApiError) {
      return { error: err.message, success: null };
    }
    throw err;
  }

  if (swid && espnS2) {
    await db
      .insert(platformIdentities)
      .values({
        userId,
        platform: "espn",
        platformUserId: swid,
        encryptedSecret: encryptSecret(espnS2),
      })
      .onConflictDoUpdate({
        target: [
          platformIdentities.userId,
          platformIdentities.platform,
          platformIdentities.platformUserId,
        ],
        set: { encryptedSecret: encryptSecret(espnS2) },
      });
  }

  await db
    .insert(connectedLeagues)
    .values({
      userId,
      platform: "espn",
      platformLeagueId: String(leagueId),
      platformUserId: swid || null,
      leagueName: league.name,
      season: String(season),
      sport: "nfl",
    })
    .onConflictDoUpdate({
      target: [
        connectedLeagues.userId,
        connectedLeagues.platform,
        connectedLeagues.platformLeagueId,
      ],
      set: {
        leagueName: league.name,
        season: String(season),
        platformUserId: swid || null,
      },
    });

  revalidatePath("/dashboard");
  return { error: null, success: `Imported "${league.name}".` };
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
