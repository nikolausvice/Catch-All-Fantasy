import Link from "next/link";
import { BarChart3, GitCompare, LayoutGrid } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";

const FEATURES = [
  {
    icon: LayoutGrid,
    title: "Every matchup, one screen",
    description: "Every league's score and projection, Sleeper and ESPN together.",
  },
  {
    icon: GitCompare,
    title: "Catch the conflicts",
    description: "See which players are on more than one of your rosters — even against yourself.",
  },
  {
    icon: BarChart3,
    title: "Know your real odds",
    description: "One combined probability breakdown for how many matchups you'll win this week.",
  },
] as const;

function MockMatchupCard({
  league,
  team,
  teamScore,
  opponent,
  opponentScore,
  week,
}: {
  league: string;
  team: string;
  teamScore: string;
  opponent: string;
  opponentScore: string;
  week: number;
}) {
  return (
    <div className="w-full max-w-xs rounded-xl border border-border bg-card p-4 text-left shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-muted-foreground">{league}</p>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Wk {week}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <p className="truncate text-sm font-medium">{team}</p>
        <p className="text-xl font-bold tabular-nums">{teamScore}</p>
      </div>
      <div className="my-2 flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">vs</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="flex items-center justify-between">
        <p className="truncate text-sm font-medium text-muted-foreground">{opponent}</p>
        <p className="text-xl font-bold tabular-nums text-muted-foreground">{opponentScore}</p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="font-semibold tracking-tight">Catch All Fantasy</span>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-10 px-4 py-16 sm:py-24">
          <div className="flex max-w-2xl flex-col items-center gap-6 text-center">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              All your fantasy leagues. <span className="text-primary">One dashboard.</span>
            </h1>
            <p className="max-w-xl text-balance text-muted-foreground">
              Every Sleeper and ESPN league, one dashboard — matchups, conflicts, and your real
              odds each week.
            </p>
            <div className="flex gap-3">
              <Link
                href="/signup"
                className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Get started
              </Link>
              <Link
                href="/login"
                className="rounded-md border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted"
              >
                Log in
              </Link>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center justify-center gap-4">
            <MockMatchupCard
              league="Dynasty Dominators"
              team="Your Team"
              teamScore="87.4"
              opponent="Waiver Wire Warriors"
              opponentScore="79.1"
              week={9}
            />
            <MockMatchupCard
              league="Office League"
              team="Your Team"
              teamScore="64.2"
              opponent="Bench Press Bandits"
              opponentScore="71.8"
              week={9}
            />
          </div>
        </section>

        <section className="border-t border-border bg-muted/30 py-16 sm:py-20">
          <div className="mx-auto grid max-w-5xl gap-8 px-4 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex flex-col gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h2 className="font-semibold">{title}</h2>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Works with the leagues you already play in
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="rounded-full border border-border px-4 py-1.5 text-sm font-medium">
                Sleeper
              </span>
              <span className="rounded-full border border-border px-4 py-1.5 text-sm font-medium">
                ESPN
              </span>
            </div>
            <p className="text-xs text-muted-foreground">More platforms coming.</p>
          </div>
        </section>

        <section className="border-t border-border py-16 sm:py-20">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">See it all, every week.</h2>
            <Link
              href="/signup"
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Get started
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
