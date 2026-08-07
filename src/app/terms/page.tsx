import Link from "next/link";
import { auth } from "@/auth";
import { GITHUB_URL, SiteFooter } from "@/components/site-footer";

const LAST_UPDATED = "August 6, 2026";

export default async function TermsPage() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href={isLoggedIn ? "/dashboard" : "/"} className="font-semibold tracking-tight">
            Catch All Fantasy
          </Link>
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Log in
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="mt-1 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="flex flex-col gap-6 text-sm text-muted-foreground">
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">1. What this is</h2>
            <p>
              Catch All Fantasy (&quot;the app,&quot; &quot;we,&quot; &quot;us&quot;) is an
              independent, unofficial tool that combines fantasy football league data from
              platforms you connect (currently Sleeper and ESPN) into a single dashboard. It is
              not affiliated with, endorsed by, or sponsored by Sleeper, ESPN, Yahoo, or the NFL.
              By creating an account or otherwise using the app, you agree to these Terms.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">2. Your account</h2>
            <p>
              You&apos;re responsible for the accuracy of the information you provide and for
              keeping your login credentials confidential. You must be old enough to form a
              binding contract in your jurisdiction to create an account. You&apos;re responsible
              for all activity that happens under your account.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">
              3. Connecting third-party platforms
            </h2>
            <p>
              When you connect a Sleeper or ESPN league, you&apos;re authorizing the app to fetch
              data from that platform on your behalf, using either a public username (Sleeper) or
              the login/cookies you provide (ESPN). You represent that you have the right to
              connect the accounts and leagues you add. Use of Sleeper and ESPN&apos;s own
              services is still governed by their respective terms — this app is just a client
              reading data you&apos;re already entitled to see.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">4. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5">
              <li>Use the app to access accounts or leagues you don&apos;t have permission to view.</li>
              <li>
                Attempt to disrupt, overload, or reverse-engineer the app or the third-party
                platforms it connects to beyond normal use.
              </li>
              <li>Use the app for any unlawful purpose.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">5. No warranty</h2>
            <p>
              The app is provided &quot;as is,&quot; without warranties of any kind. Scores,
              projections, probabilities, and other analysis are estimates pulled from third-party
              data and may be incomplete, delayed, or wrong — don&apos;t rely on them for anything
              beyond casual fantasy football decisions. We don&apos;t guarantee uninterrupted or
              error-free access, especially when it depends on a third-party platform&apos;s own
              availability.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">6. Limitation of liability</h2>
            <p>
              To the fullest extent permitted by law, we aren&apos;t liable for any indirect,
              incidental, or consequential damages arising from your use of the app, including
              losses related to fantasy football outcomes, league standings, or side bets.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">7. Account deletion</h2>
            <p>
              You can delete your account at any time from Settings. This permanently removes
              your account, every connected league, and every saved platform login associated
              with it — it can&apos;t be undone.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">8. Changes to these terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of the app after a
              change means you accept the updated Terms.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">9. Open source</h2>
            <p>
              The app&apos;s source is public —{" "}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:underline"
              >
                available on GitHub
              </a>
              . See our{" "}
              <Link href="/privacy" className="text-foreground hover:underline">
                Privacy Policy
              </Link>{" "}
              for how your data is handled.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
