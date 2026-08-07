import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ElementHeightVar } from "@/components/element-height-var";
import { RefreshButton } from "@/components/refresh-button";
import { SiteFooter } from "@/components/site-footer";
import { UserMenu } from "@/components/user-menu";
import { requireSessionUserId } from "@/lib/auth/require-user";

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

  return (
    <div className="flex min-h-screen flex-col">
      {/* Solid, not translucent — a blurred/semi-transparent header lets
          whatever's scrolling underneath show through as ghosting the
          instant it passes beneath, which reads as a rendering glitch
          rather than an intentional effect. */}
      <header id="site-header" className="sticky top-0 z-20 border-b border-border bg-background">
        <ElementHeightVar selector="#site-header" varName="--site-header-height" />
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:py-4">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Catch All Fantasy
          </Link>
          {/* + Add league moved to the app tabs bar (to the right of
              Outcomes) — see AppTabsBar in intel-tabs.tsx — so it mirrors
              the Outcomes filter row's own trailing "?" button instead of
              living up here. */}
          <div className="flex items-center gap-2">
            <RefreshButton />
            <UserMenu />
          </div>
        </div>
      </header>
      {/* pt trimmed well below pb — the tab bar right below this has its
          own py-3, so a full py-6/py-8 top padding here on top of that
          stacked into a noticeably bigger gap above the tabs than below
          any other section. */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-6 pt-4 sm:pb-8 sm:pt-4">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
