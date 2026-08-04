import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { connectedLeagues, platformIdentities } from "@/db/schema";
import { EspnIdentityManager, type EspnIdentitySummary } from "@/components/espn-identity-manager";
import { RemoveLeagueButton } from "@/components/remove-league-button";
import { requireSessionUserId, STALE_SESSION_MESSAGE } from "@/lib/auth/require-user";

const PLATFORM_LABEL: Record<string, string> = {
  sleeper: "Sleeper",
  espn: "ESPN",
  yahoo: "Yahoo",
  demo: "Demo",
};

export default async function SettingsPage() {
  const userId = await requireSessionUserId();
  if (!userId) return <p className="text-sm text-destructive">{STALE_SESSION_MESSAGE}</p>;

  const [identities, leagues] = await Promise.all([
    db.query.platformIdentities.findMany({
      where: and(eq(platformIdentities.userId, userId), eq(platformIdentities.platform, "espn")),
    }),
    db.query.connectedLeagues.findMany({
      where: eq(connectedLeagues.userId, userId),
    }),
  ]);

  const espnIdentities: EspnIdentitySummary[] = identities.map((identity) => ({
    id: identity.id,
    addedAt: identity.createdAt.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    leagueNames: leagues
      .filter((l) => l.platform === "espn" && l.platformUserId === identity.platformUserId)
      .map((l) => l.leagueName),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to dashboard
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">Saved ESPN logins</h2>
          <p className="text-sm text-muted-foreground">
            Each set of ESPN cookies you&apos;ve signed in with is stored separately. Deleting one
            only stops syncing for the leagues it&apos;s used by — leagues connected with a
            different ESPN login keep working.
          </p>
        </div>
        <EspnIdentityManager identities={espnIdentities} />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">Connected leagues</h2>
          <p className="text-sm text-muted-foreground">
            Remove any league you no longer want to see on your dashboard.
          </p>
        </div>
        {leagues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leagues connected yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {leagues.map((league) => (
              <li
                key={league.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{league.leagueName}</p>
                  <p className="text-xs text-muted-foreground">
                    {PLATFORM_LABEL[league.platform] ?? league.platform} · {league.season}
                  </p>
                </div>
                <RemoveLeagueButton
                  leagueRowId={league.id}
                  leagueName={league.leagueName}
                  redirectTo={null}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
