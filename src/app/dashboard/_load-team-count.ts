import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { platformIdentities, connectedLeagues } from "@/db/schema";
import { tryDecryptSecret } from "@/lib/crypto/secrets";
import { EspnApiError } from "@/lib/espn/client";
import { getCachedEspnTeamSummaries, getCachedSleeperTeamSummaries } from "@/lib/leagues/cache";
import { SleeperApiError } from "@/lib/sleeper/client";

export type LeagueRow = typeof connectedLeagues.$inferSelect;

/**
 * Best-effort team count for a "Finish setup" league card — null (the card
 * just omits the line) rather than surfacing a fetch failure, since this is
 * a minor detail on a card whose real call-to-action is picking a team, not
 * a place to show an ESPN/Sleeper error.
 */
export async function loadTeamCount(league: LeagueRow, userId: string): Promise<number | null> {
  try {
    if (league.platform === "sleeper") {
      return (await getCachedSleeperTeamSummaries(league.platformLeagueId)).length;
    }

    if (league.platform === "espn") {
      if (!league.platformUserId) return null;
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
      if (!decrypted) return null;

      const teams = await getCachedEspnTeamSummaries(
        Number(league.platformLeagueId),
        Number(league.season),
        decrypted,
        identity!.platformUserId,
      );
      return teams.length;
    }

    return null;
  } catch (err) {
    if (err instanceof SleeperApiError || err instanceof EspnApiError) return null;
    throw err;
  }
}
