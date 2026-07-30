import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues } from "@/db/schema";
import { ConnectSleeperForm } from "@/components/connect-sleeper-form";
import { ConnectEspnForm } from "@/components/connect-espn-form";

const PLATFORM_LABEL: Record<string, string> = {
  sleeper: "Sleeper",
  espn: "ESPN",
  yahoo: "Yahoo",
};

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const leagues = await db
    .select()
    .from(connectedLeagues)
    .where(eq(connectedLeagues.userId, userId))
    .orderBy(desc(connectedLeagues.createdAt));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Your leagues
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your fantasy accounts to compare rosters across every
          league you play in.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Connect Sleeper
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Just your username — Sleeper&apos;s API is public and read-only.
          </p>
          <ConnectSleeperForm />
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Connect ESPN
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            League ID and season are enough for public leagues; private
            leagues also need the espn_s2 and SWID cookies.
          </p>
          <ConnectEspnForm />
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Connected leagues {leagues.length ? `(${leagues.length})` : ""}
        </h2>

        {leagues.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No leagues connected yet. Connect Sleeper or ESPN above to get
            started.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {leagues.map((league) => (
              <li
                key={league.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
              >
                {league.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={league.avatarUrl}
                    alt=""
                    className="size-10 rounded-md"
                  />
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                    {PLATFORM_LABEL[league.platform]?.[0] ?? "?"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{league.leagueName}</p>
                  <p className="text-xs text-muted-foreground">
                    {PLATFORM_LABEL[league.platform] ?? league.platform} ·{" "}
                    {league.season}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
