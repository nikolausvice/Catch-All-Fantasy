import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { platformIdentities, connectedLeagues } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto/secrets";
import { EspnApiError } from "@/lib/espn/client";
import { getCachedEspnTeamMatchup, getCachedSleeperTeamMatchup } from "@/lib/leagues/cache";
import { SleeperApiError } from "@/lib/sleeper/client";
import type { LeagueMatchup } from "@/lib/leagues/types";

export type LeagueRow = typeof connectedLeagues.$inferSelect;

export async function loadMatchup(
  league: LeagueRow,
  userId: string,
  week: number,
): Promise<{ matchup: LeagueMatchup | null; error: string | null }> {
  try {
    if (league.platform === "sleeper") {
      return {
        matchup: await getCachedSleeperTeamMatchup(
          league.platformLeagueId,
          league.userTeamId!,
          week,
        ),
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
        if (identity?.encryptedSecret) {
          espnS2 = decryptSecret(identity.encryptedSecret);
          swid = identity.platformUserId;
        }
      }

      return {
        matchup: await getCachedEspnTeamMatchup(
          Number(league.platformLeagueId),
          Number(league.season),
          league.userTeamId!,
          espnS2,
          swid,
        ),
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
