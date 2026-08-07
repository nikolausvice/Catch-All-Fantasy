"use client";

import { useActionState, useImperativeHandle, useState, type Ref } from "react";
import {
  connectSleeperLeagues,
  lookupSleeperLeagues,
  type SleeperLookupState,
} from "@/app/dashboard/actions";
import type { BackHandle } from "./add-league-section";

export function ConnectSleeperForm({ ref }: { ref?: Ref<BackHandle> }) {
  const [lookupState, lookupAction, lookupPending] = useActionState(lookupSleeperLeagues, {
    error: null,
    result: null,
  });
  const [connectState, connectAction, connectPending] = useActionState(connectSleeperLeagues, {
    error: null,
    success: null,
  });
  // Controlled so React's automatic post-action form reset (it resets
  // uncontrolled fields) can't wipe out what the user typed.
  const [username, setUsername] = useState("");

  const result = lookupState.result;

  // Track which lookup result the checkbox selection belongs to, so a fresh
  // lookup re-defaults to "all selected" but the user deselecting everything
  // on the CURRENT result doesn't get silently reset back to all-selected.
  const [selectedFor, setSelectedFor] = useState<SleeperLookupState["result"]>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [restarted, setRestarted] = useState(false);

  // Exposed to the top-level "← Back" button (see add-league-section.tsx):
  // pop back from the found-leagues list to the lookup form, one step at a
  // time, instead of that button always jumping straight to the platform
  // picker.
  useImperativeHandle(ref, () => ({
    back: () => {
      if (result && !restarted) {
        setRestarted(true);
        return true;
      }
      return false;
    },
  }));

  if (result !== selectedFor) {
    setSelectedFor(result);
    setSelectedIds(new Set(result?.leagues.map((l) => l.id) ?? []));
  }

  function toggleLeague(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (connectState.success) {
    return <p className="text-sm text-primary">{connectState.success}</p>;
  }

  if (!result || restarted) {
    return (
      <form action={lookupAction} className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="sleeper-username" className="text-sm font-medium">
              Sleeper username
            </label>
            <input
              id="sleeper-username"
              name="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. jane_doe"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            />
          </div>
          <button
            type="submit"
            disabled={lookupPending}
            onClick={() => setRestarted(false)}
            className="inline-flex min-w-[150px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {lookupPending ? "Looking up…" : "Find leagues"}
          </button>
        </div>

        {lookupState.error && (
          <p className="text-sm text-destructive">{lookupState.error}</p>
        )}
      </form>
    );
  }

  return (
    <form action={connectAction} className="flex flex-col gap-3">
      <input type="hidden" name="sleeperUserId" value={result.sleeperUserId} />
      <input type="hidden" name="sleeperUsername" value={result.sleeperUsername} />
      <input type="hidden" name="displayName" value={result.displayName} />
      <input type="hidden" name="season" value={result.season} />
      <input type="hidden" name="leaguesJson" value={JSON.stringify(result.leagues)} />

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Found {result.leagues.length} league{result.leagues.length === 1 ? "" : "s"}{" "}
          for <span className="font-medium text-foreground">{result.displayName}</span>.
          Pick which to add:
        </p>
        <button
          type="button"
          onClick={() =>
            setSelectedIds(
              selectedIds.size === result.leagues.length
                ? new Set()
                : new Set(result.leagues.map((l) => l.id)),
            )
          }
          className="shrink-0 text-xs font-medium text-primary hover:underline"
        >
          {selectedIds.size === result.leagues.length ? "Deselect all" : "Select all"}
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {result.leagues.map((league) => (
          <li key={league.id}>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted">
              <input
                type="checkbox"
                name="leagueIds"
                value={league.id}
                checked={selectedIds.has(league.id)}
                onChange={() => toggleLeague(league.id)}
                className="size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{league.name}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={connectPending || selectedIds.size === 0}
          className="inline-flex min-w-[150px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {connectPending
            ? "Adding…"
            : `Add ${selectedIds.size || ""} league${selectedIds.size === 1 ? "" : "s"}`}
        </button>
      </div>

      {connectState.error && (
        <p className="text-sm text-destructive">{connectState.error}</p>
      )}
    </form>
  );
}
