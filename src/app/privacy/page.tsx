import Link from "next/link";
import { auth } from "@/auth";
import { SiteFooter } from "@/components/site-footer";

const LAST_UPDATED = "August 6, 2026";

export default async function PrivacyPage() {
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
          <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="mt-1 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="flex flex-col gap-6 text-sm text-muted-foreground">
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">1. What we collect</h2>
            <ul className="list-disc pl-5">
              <li>
                <span className="text-foreground">Account info:</span> the email address and
                password you sign up with. Your password is never stored in plain text — only a
                bcrypt hash of it.
              </li>
              <li>
                <span className="text-foreground">League connections:</span> the Sleeper
                usernames and league IDs you add, and which team is yours in each league.
              </li>
              <li>
                <span className="text-foreground">ESPN cookies:</span> if you connect a private
                ESPN league, the espn_s2/SWID cookie pair ESPN issues after you sign in, stored
                encrypted at rest. Your ESPN password itself is never stored — it&apos;s submitted
                directly to ESPN&apos;s own login page and never saved.
              </li>
              <li>
                <span className="text-foreground">Usage analytics:</span> basic, aggregated page
                analytics via Vercel Analytics to understand how the app is used. This isn&apos;t
                tied to your fantasy football data.
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">2. How we use it</h2>
            <p>
              Your data is used only to run the app: authenticating you, fetching your
              leagues&apos; scores and rosters from Sleeper/ESPN on your behalf, and computing the
              cross-league analysis shown on your dashboard. We don&apos;t sell your data, and we
              don&apos;t use it for advertising.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">3. Who we share it with</h2>
            <p>
              We don&apos;t share your account data with third parties, other than the
              infrastructure providers that run the app (hosting, database, and analytics
              providers), who process it only on our behalf to keep the app running. Requests to
              Sleeper and ESPN happen using your own connected credentials/cookies, the same way
              your browser would talk to them directly.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">4. Cookies</h2>
            <p>
              We use one cookie to keep you signed in between visits — that&apos;s it. There are
              no advertising or third-party tracking cookies, and no cross-site tracking. Your
              ESPN espn_s2/SWID cookies (see above) aren&apos;t browser cookies at all; they&apos;re
              stored encrypted in our database and used server-side to talk to ESPN on your
              behalf. Because the only cookie we set is strictly necessary to run the app, there&apos;s
              nothing non-essential here to ask your consent for.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">5. How long we keep it</h2>
            <p>
              We keep your data for as long as your account exists. Removing a single connected
              league or saved ESPN login deletes that specific data immediately. Deleting your
              account (available any time in Settings) permanently removes your account, every
              connected league, and every saved login — this can&apos;t be undone.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">6. Security</h2>
            <p>
              Passwords are hashed with bcrypt. ESPN cookies are encrypted at rest. We use
              standard safeguards to protect your data, but no method of storage or transmission
              is 100% secure, and we can&apos;t guarantee absolute security.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">7. Your choices</h2>
            <p>
              You can remove any connected league or saved ESPN login, or delete your account
              entirely, at any time from Settings — no need to contact anyone.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">8. Changes to this policy</h2>
            <p>
              We may update this policy from time to time. Continued use of the app after a
              change means you accept the updated policy.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">9. Related</h2>
            <p>
              See our{" "}
              <Link href="/terms" className="text-foreground hover:underline">
                Terms of Service
              </Link>{" "}
              for the rules that govern using the app.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
