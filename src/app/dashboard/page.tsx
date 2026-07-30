import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues } from "@/db/schema";
import { ConnectSleeperForm } from "@/components/connect-sleeper-form";

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

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Connect a platform
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Sleeper is supported today. ESPN and Yahoo connections are coming
          next.
        </p>
        <ConnectSleeperForm />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Connected leagues {leagues.length ? `(${leagues.length})` : ""}
        </h2>

        {leagues.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No leagues connected yet. Connect your Sleeper account above to
            get started.
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
