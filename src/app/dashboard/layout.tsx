import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { platformIdentities } from "@/db/schema";
import { AddLeagueButton } from "@/components/add-league-button";
import { RefreshButton } from "@/components/refresh-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireSessionUserId } from "@/lib/auth/require-user";
import { headerButtonClass } from "@/lib/utils";
import { signOut } from "../(auth)/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // A session's JWT can outlive the user row it points to (e.g. the DB was
  // reset). Catch that here rather than letting every page/action underneath
  // hit a foreign-key crash on first write. Redirect to /clear-session (not
  // /login directly) so the stale cookie actually gets cleared — otherwise
  // the still-valid-looking JWT makes the proxy/middleware bounce this
  // request straight back to /dashboard, looping forever.
  const userId = await requireSessionUserId();
  if (!userId) redirect("/clear-session");

  const user = session.user;

  const espnIdentity = await db.query.platformIdentities.findFirst({
    where: and(eq(platformIdentities.userId, userId), eq(platformIdentities.platform, "espn")),
    columns: { id: true },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:py-4">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Catch All Fantasy
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.email}
            </span>
            <AddLeagueButton hasStoredEspnCookies={!!espnIdentity} />
            <RefreshButton />
            <ThemeToggle />
            <form action={signOut}>
              <button type="submit" className={headerButtonClass}>
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
