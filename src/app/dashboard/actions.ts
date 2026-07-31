"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues, platformIdentities } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { EspnApiError, getEspnLeagueInfo } from "@/lib/espn/client";
import { requireSessionUserId, STALE_SESSION_MESSAGE } from "@/lib/auth/require-user";
import {
  getSleeperLeaguesForUser,
  getSleeperNflState,
  getSleeperUserByUsername,
  sleeperAvatarUrl,
} from "@/lib/sleeper/client";

export type SleeperLookupState = {
  error: string | null;
  result: {
    sleeperUserId: string;
    sleeperUsername: string;
    displayName: string;
    season: string;
    leagues: { id: string; name: string; avatarUrl: string | null }[];
  } | null;
};

/** Step 1: look up the account and list its leagues — nothing is saved yet. */
export async function lookupSleeperLeagues(
  _prevState: SleeperLookupState,
  formData: FormData,
): Promise<SleeperLookupState> {
  const username = String(formData.get("username") ?? "").trim();
  if (!username) return { error: "Enter a Sleeper username.", result: null };

  const userId = await requireSessionUserId();
  if (!userId) return { error: STALE_SESSION_MESSAGE, result: null };

  const sleeperUser = await getSleeperUserByUsername(username);
  if (!sleeperUser) {
    return { error: `No Sleeper user found for "${username}".`, result: null };
  }

  const { season } = await getSleeperNflState();
  const leagues = await getSleeperLeaguesForUser(sleeperUser.user_id, season);

  if (leagues.length === 0) {
    return {
      error: `Found ${sleeperUser.display_name}, but no ${season} leagues were found.`,
      result: null,
    };
  }

  return {
    error: null,
    result: {
      sleeperUserId: sleeperUser.user_id,
      sleeperUsername: sleeperUser.username,
      displayName: sleeperUser.display_name,
      season,
      leagues: leagues.map((l) => ({
        id: l.league_id,
        name: l.name,
        avatarUrl: sleeperAvatarUrl(l.avatar),
      })),
    },
  };
}

export type ConnectSleeperLeaguesState = {
  error: string | null;
  success: string | null;
};

/** Step 2: import just the leagues the user checked. */
export async function connectSleeperLeagues(
  _prevState: ConnectSleeperLeaguesState,
  formData: FormData,
): Promise<ConnectSleeperLeaguesState> {
  const sleeperUserId = String(formData.get("sleeperUserId") ?? "").trim();
  const sleeperUsername = String(formData.get("sleeperUsername") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const season = String(formData.get("season") ?? "").trim();
  const selectedIds = new Set(formData.getAll("leagueIds").map(String));

  let allLeagues: { id: string; name: string; avatarUrl: string | null }[] = [];
  try {
    allLeagues = JSON.parse(String(formData.get("leaguesJson") ?? "[]"));
  } catch {
    return { error: "Something went wrong — start over.", success: null };
  }

  const selected = allLeagues.filter((l) => selectedIds.has(l.id));
  if (selected.length === 0) {
    return { error: "Select at least one league.", success: null };
  }
  if (!sleeperUserId) {
    return { error: "Missing Sleeper account — start over.", success: null };
  }

  const userId = await requireSessionUserId();
  if (!userId) return { error: STALE_SESSION_MESSAGE, success: null };

  await db
    .insert(platformIdentities)
    .values({
      userId,
      platform: "sleeper",
      platformUserId: sleeperUserId,
      platformUsername: sleeperUsername,
    })
    .onConflictDoUpdate({
      target: [
        platformIdentities.userId,
        platformIdentities.platform,
        platformIdentities.platformUserId,
      ],
      set: { platformUsername: sleeperUsername },
    });

  for (const league of selected) {
    await db
      .insert(connectedLeagues)
      .values({
        userId,
        platform: "sleeper",
        platformLeagueId: league.id,
        platformUserId: sleeperUserId,
        leagueName: league.name,
        season,
        sport: "nfl",
        avatarUrl: league.avatarUrl,
      })
      .onConflictDoUpdate({
        target: [
          connectedLeagues.userId,
          connectedLeagues.platform,
          connectedLeagues.platformLeagueId,
        ],
        set: {
          leagueName: league.name,
          season,
          avatarUrl: league.avatarUrl,
        },
      });
  }

  revalidatePath("/dashboard");
  return {
    error: null,
    success: `Added ${selected.length} league${selected.length === 1 ? "" : "s"} for ${displayName}.`,
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

  // Reuse a previously-saved espn_s2/SWID when the form was left blank —
  // all of a user's ESPN leagues share the same login, so there's no need
  // to make them re-paste cookies for every league they add.
  let effectiveEspnS2 = espnS2 || undefined;
  let effectiveSwid = swid || undefined;
  if (!effectiveEspnS2 || !effectiveSwid) {
    const stored = await db.query.platformIdentities.findFirst({
      where: and(eq(platformIdentities.userId, userId), eq(platformIdentities.platform, "espn")),
    });
    if (stored?.encryptedSecret) {
      effectiveEspnS2 = decryptSecret(stored.encryptedSecret);
      effectiveSwid = stored.platformUserId;
    }
  }

  let league;
  try {
    league = await getEspnLeagueInfo({
      leagueId,
      seasonId: season,
      espnS2: effectiveEspnS2,
      swid: effectiveSwid,
    });
  } catch (err) {
    if (err instanceof EspnApiError) {
      return { error: err.message, success: null };
    }
    throw err;
  }

  // Only re-write the stored secret if the user actually typed new cookies
  // this time (i.e. don't overwrite with the same reused value every time).
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
      platformUserId: effectiveSwid || null,
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
        platformUserId: effectiveSwid || null,
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
