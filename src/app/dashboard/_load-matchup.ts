import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { platformIdentities, connectedLeagues } from "@/db/schema";
import { tryDecryptSecret } from "@/lib/crypto/secrets";
import { EspnApiError } from "@/lib/espn/client";
import { getCachedEspnTeamMatchup, getCachedSleeperTeamMatchup } from "@/lib/leagues/cache";
import { computeDemoMatchup } from "@/lib/leagues/demo";
import { applyScoreOverrides, type PlayerOverride } from "@/lib/leagues/score-overrides";
import { SleeperApiError } from "@/lib/sleeper/client";
import type { LeagueMatchup } from "@/lib/leagues/types";

export type LeagueRow = typeof connectedLeagues.$inferSelect;

export async function loadMatchup(
  league: LeagueRow,
  userId: string,
  week: number,
  scoreOverrides: Map<string, PlayerOverride>,
): Promise<{ matchup: LeagueMatchup | null; error: string | null }> {
  try {
    if (league.platform === "demo") {
      return {
        matchup: league.demoRoster
          ? computeDemoMatchup(applyScoreOverrides(league.demoRoster, scoreOverrides))
          : null,
        error: league.demoRoster ? null : "This demo league has no roster data yet.",
      };
    }

    if (league.platform === "sleeper") {
      const matchup = await getCachedSleeperTeamMatchup(
        league.platformLeagueId,
        league.userTeamId!,
        week,
      );
      return {
        matchup: matchup ? applyScoreOverrides(matchup, scoreOverrides) : matchup,
        error: null,
      };
    }

    if (league.platform === "espn") {
      let espnS2: string | undefined;
      let swid: string | undefined;

      if (league.platformUserId) {
        const identity = await db.query.platformIdentities.findFirst({
          where: and(
            eq(platformIdentities.userId, userId),
            eq(platformIdentities.platform, "espn"),
            eq(platformIdentities.platformUserId, league.platformUserId),
          ),
        });
        const decrypted = identity?.encryptedSecret
          ? tryDecryptSecret(identity.encryptedSecret)
          : null;
        if (decrypted) {
          espnS2 = decrypted;
          swid = identity!.platformUserId;
        }
      }

      const matchup = await getCachedEspnTeamMatchup(
        Number(league.platformLeagueId),
        Number(league.season),
        league.userTeamId!,
        espnS2,
        swid,
      );
      return {
        matchup: matchup ? applyScoreOverrides(matchup, scoreOverrides) : matchup,
        error: null,
      };
    }

    return { matchup: null, error: "Yahoo leagues aren't supported yet." };
  } catch (err) {
    if (err instanceof SleeperApiError || err instanceof EspnApiError) {
      return { matchup: null, error: err.message };
    }
    throw err;
  }
}
