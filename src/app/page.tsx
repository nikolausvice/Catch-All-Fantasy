import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="font-semibold tracking-tight">
            Gridiron Ledger
          </span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
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

      <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          One roster. <span className="text-primary">Every league.</span>
        </h1>
        <p className="max-w-xl text-balance text-muted-foreground">
          Connect your Sleeper, ESPN, and Yahoo fantasy football leagues in
          one place. See exactly what each of your players needs to do this
          week to win every matchup you&apos;re in — even when they&apos;re
          on opposite sides of two different leagues.
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
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Not affiliated with Sleeper, ESPN, or Yahoo.
      </footer>
    </div>
  );
}
