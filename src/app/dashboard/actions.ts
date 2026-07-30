"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getSleeperLeaguesForUser,
  getSleeperNflState,
  getSleeperUserByUsername,
  sleeperAvatarUrl,
} from "@/lib/sleeper/client";

export type ConnectSleeperState = { error: string | null; success: string | null };

export async function connectSleeperAccount(
  _prevState: ConnectSleeperState,
  formData: FormData,
): Promise<ConnectSleeperState> {
  const username = String(formData.get("username") ?? "").trim();
  if (!username) return { error: "Enter a Sleeper username.", success: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in.", success: null };

  const sleeperUser = await getSleeperUserByUsername(username);
  if (!sleeperUser) {
    return { error: `No Sleeper user found for "${username}".`, success: null };
  }

  const { season } = await getSleeperNflState();

  const { error: identityError } = await supabase
    .from("platform_identities")
    .upsert(
      {
        user_id: user.id,
        platform: "sleeper",
        platform_user_id: sleeperUser.user_id,
        platform_username: sleeperUser.username,
      },
      { onConflict: "user_id,platform,platform_user_id" },
    );

  if (identityError) {
    return { error: identityError.message, success: null };
  }

  const leagues = await getSleeperLeaguesForUser(sleeperUser.user_id, season);

  if (leagues.length === 0) {
    return {
      error: null,
      success: `Connected as ${sleeperUser.display_name}, but no ${season} leagues were found.`,
    };
  }

  const rows = leagues.map((league) => ({
    user_id: user.id,
    platform: "sleeper" as const,
    platform_league_id: league.league_id,
    platform_user_id: sleeperUser.user_id,
    league_name: league.name,
    season: league.season,
    sport: league.sport,
    avatar_url: sleeperAvatarUrl(league.avatar),
  }));

  const { error: leaguesError } = await supabase
    .from("connected_leagues")
    .upsert(rows, { onConflict: "user_id,platform,platform_league_id" });

  if (leaguesError) {
    return { error: leaguesError.message, success: null };
  }

  revalidatePath("/dashboard");
  return {
    error: null,
    success: `Imported ${leagues.length} league${leagues.length === 1 ? "" : "s"} for ${sleeperUser.display_name}.`,
  };
}

export async function removeConnectedLeague(leagueRowId: string) {
  const supabase = await createClient();
  await supabase.from("connected_leagues").delete().eq("id", leagueRowId);
  revalidatePath("/dashboard");
}
