import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues, platformIdentities } from "@/db/schema";
import { tryDecryptSecret } from "@/lib/crypto/secrets";
import { EspnApiError } from "@/lib/espn/client";
import { getCachedEspnTeamSummaries, getCachedSleeperTeamSummaries } from "@/lib/leagues/cache";
import { SleeperApiError } from "@/lib/sleeper/client";
import type { LeagueTeamSummary } from "@/lib/leagues/types";
import { RemoveLeagueButton } from "@/components/remove-league-button";
import { TeamPickCard } from "./team-pick-card";

const PLATFORM_LABEL: Record<string, string> = {
  sleeper: "Sleeper",
  espn: "ESPN",
  yahoo: "Yahoo",
};

async function loadSummaries(
  league: typeof connectedLeagues.$inferSelect,
  userId: string,
): Promise<{ teams: LeagueTeamSummary[] | null; error: string | null }> {
  try {
    if (league.platform === "sleeper") {
      return {
        teams: await getCachedSleeperTeamSummaries(league.platformLeagueId),
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

      return {
        teams: await getCachedEspnTeamSummaries(
          Number(league.platformLeagueId),
          Number(league.season),
          espnS2,
          swid,
        ),
        error: null,
      };
    }

    return { teams: null, error: "Yahoo leagues aren't supported yet." };
  } catch (err) {
    if (err instanceof SleeperApiError || err instanceof EspnApiError) {
      return { teams: null, error: err.message };
    }
    throw err;
  }
}

export default async function SelectTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const league = await db.query.connectedLeagues.findFirst({
    where: and(
      eq(connectedLeagues.id, id),
      eq(connectedLeagues.userId, userId),
    ),
  });

  if (!league) notFound();

  const { teams, error } = await loadSummaries(league, userId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Which team is yours?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {league.leagueName} · {PLATFORM_LABEL[league.platform] ?? league.platform}{" "}
          · {league.season}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
          {league.platform === "espn" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Sign in again via <span className="font-medium">+ Add league</span> on the
              dashboard to restore it, or remove this league below.
            </p>
          )}
          <div className="mt-3">
            <RemoveLeagueButton
              leagueRowId={league.id}
              leagueName={league.leagueName}
              redirectTo="/dashboard"
            />
          </div>
        </div>
      )}

      {teams && teams.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No teams found yet — this league may not have any rosters set up.
        </div>
      )}

      {teams && teams.length > 0 && (
        <div className="flex flex-col gap-3">
          {teams.map((team) => (
            <TeamPickCard
              key={team.id}
              leagueRowId={league.id}
              team={team}
              isSelected={league.userTeamId === team.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
