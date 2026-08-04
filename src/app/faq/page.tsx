import Link from "next/link";
import { auth } from "@/auth";
import { SiteFooter } from "@/components/site-footer";

const FAQS: { question: string; answer: React.ReactNode }[] = [
  {
    question: "What does Catch All Fantasy actually do?",
    answer:
      "It's one dashboard for every fantasy football league you're in. Connect your Sleeper " +
      "and ESPN leagues and see every matchup's score and projection together, which players " +
      "show up on more than one of your rosters (including against yourself), and a single " +
      "probability breakdown for how many of your leagues you're favored to win this week.",
  },
  {
    question: "Which platforms are supported?",
    answer:
      "Sleeper and ESPN today. Yahoo isn't supported yet. Sleeper connects with just a " +
      "username — its API is public and read-only. ESPN needs a sign-in (or its espn_s2/SWID " +
      "cookies) for private leagues; public ESPN leagues just need a league ID.",
  },
  {
    question: "Do you store my ESPN password?",
    answer:
      "No. Signing in submits your credentials directly to ESPN's real login page, through a " +
      "real browser this app controls — your password only ever touches this server and " +
      "ESPN's own login endpoint, never a third party, and it's never saved. What does get " +
      "saved (encrypted) is the espn_s2/SWID cookie pair ESPN issues after a successful login, " +
      "so the app can keep refreshing your league's data without asking you to sign in every time.",
  },
  {
    question: "Why does ESPN ask me for a verification code sometimes?",
    answer:
      "That's the same MFA challenge you'd see signing into espn.com directly — it means " +
      "ESPN itself wants to confirm it's you. The code you type goes straight into ESPN's real " +
      "form; this app isn't bypassing anything, just relaying the code you already have.",
  },
  {
    question: "What happens if I forget/delete a saved ESPN login?",
    answer:
      "Any leagues that were using it stop being able to refresh their data until you sign in " +
      "again — leagues added with a different ESPN login aren't affected. You'll see which " +
      "leagues need reconnecting right on the dashboard, with an option to remove them instead " +
      "if you'd rather not bother.",
  },
  {
    question: "Is this affiliated with Sleeper, ESPN, or Yahoo?",
    answer: "No. This is an independent project and isn't affiliated with or endorsed by any of them.",
  },
  {
    question: "Is this open source?",
    answer: (
      <>
        Yes —{" "}
        <a
          href="https://github.com/nikolausvice/Catch-All-Fantasy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          the code is on GitHub
        </a>
        .
      </>
    ),
  },
];

export default async function FaqPage() {
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
          <h1 className="text-3xl font-semibold tracking-tight">Frequently asked questions</h1>
        </div>

        <div className="flex flex-col gap-3">
          {FAQS.map(({ question, answer }) => (
            <details
              key={question}
              className="group rounded-lg border border-border bg-card p-4"
            >
              <summary className="cursor-pointer select-none list-none font-medium">
                {question}
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
