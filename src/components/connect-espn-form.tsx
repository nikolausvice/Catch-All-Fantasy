"use client";

import { useActionState, useState } from "react";
import { connectEspnAccount } from "@/app/dashboard/actions";

const currentYear = new Date().getFullYear();

export function ConnectEspnForm() {
  const [state, formAction, pending] = useActionState(connectEspnAccount, {
    error: null,
    success: null,
  });
  // Controlled for the same reason as the Sleeper form: React resets
  // uncontrolled fields after a form action completes.
  const [leagueId, setLeagueId] = useState("");
  const [season, setSeason] = useState(String(currentYear));
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="espn-league-id" className="text-sm font-medium">
            League ID
          </label>
          <input
            id="espn-league-id"
            name="leagueId"
            required
            inputMode="numeric"
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
            placeholder="e.g. 387659"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="espn-season" className="text-sm font-medium">
            Season
          </label>
          <input
            id="espn-season"
            name="season"
            required
            inputMode="numeric"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          />
        </div>
      </div>

      <fieldset className="rounded-lg border border-dashed border-border p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Private leagues only
        </legend>
        <p className="mb-3 text-xs text-muted-foreground">
          Skip these two fields if your league is public. Most leagues are
          private by default, so you&apos;ll usually need them.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="espn-s2" className="text-sm font-medium">
              espn_s2 cookie
            </label>
            <input
              id="espn-s2"
              name="espnS2"
              type="password"
              autoComplete="off"
              value={espnS2}
              onChange={(e) => setEspnS2(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="espn-swid" className="text-sm font-medium">
              SWID cookie
            </label>
            <input
              id="espn-swid"
              name="swid"
              type="password"
              autoComplete="off"
              value={swid}
              onChange={(e) => setSwid(e.target.value)}
              placeholder="{XXXXXXXX-XXXX-...}"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            />
          </div>
        </div>

        <details className="mt-3 text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">
            Where do I find these cookies?
          </summary>
          <p className="mt-2">
            Log into{" "}
            <a
              href="https://www.espn.com/fantasy/football/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              espn.com
            </a>
            , open DevTools (F12) → Application → Cookies →
            espn.com, and copy the values of <code>espn_s2</code> and{" "}
            <code>SWID</code>. Cookies are encrypted before being stored.
          </p>
        </details>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full min-w-[150px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Connecting…" : "Connect ESPN"}
      </button>

      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-primary">{state.success}</p>
      )}
    </form>
  );
}
