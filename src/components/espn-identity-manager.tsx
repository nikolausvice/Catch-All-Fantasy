"use client";

import { useState, useTransition } from "react";
import { disconnectEspnIdentity } from "@/app/dashboard/actions";

export type EspnIdentitySummary = {
  id: string;
  addedAt: string;
  leagueNames: string[];
};

/** One saved ESPN cookie set. Deleting it only affects the leagues listed under it — a
 * different cookie set (a different ESPN account/login) can keep syncing its own leagues
 * untouched, since each is stored as its own row keyed by its own SWID. */
function EspnIdentityRow({ identity }: { identity: EspnIdentitySummary }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [affectedLeagues, setAffectedLeagues] = useState<string[] | null>(null);
  const [removed, setRemoved] = useState(false);

  function disconnect(force: boolean) {
    startTransition(async () => {
      const result = await disconnectEspnIdentity(identity.id, force);
      if (result.affectedLeagueNames?.length) {
        setAffectedLeagues(result.affectedLeagueNames);
        setConfirming(true);
        return;
      }
      setRemoved(true);
    });
  }

  if (removed) return null;

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">ESPN login added {identity.addedAt}</p>
          <p className="text-xs text-muted-foreground">
            {identity.leagueNames.length === 0
              ? "Not used by any connected league."
              : `Used by: ${identity.leagueNames.join(", ")}`}
          </p>
        </div>
        {!confirming && (
          <button
            type="button"
            disabled={pending}
            onClick={() => disconnect(false)}
            className="shrink-0 rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
          >
            {pending ? "Removing…" : "Delete cookies"}
          </button>
        )}
      </div>
      {confirming && affectedLeagues && (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5">
          <p className="text-sm text-destructive">
            Deleting this login will stop syncing for{" "}
            {affectedLeagues.length === 1 ? "this league" : `these ${affectedLeagues.length} leagues`}{" "}
            until you reconnect: {affectedLeagues.join(", ")}.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => disconnect(true)}
              className="text-xs font-medium text-destructive underline-offset-2 hover:underline disabled:opacity-60"
            >
              {pending ? "Removing…" : "Delete anyway"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export function EspnIdentityManager({ identities }: { identities: EspnIdentitySummary[] }) {
  if (identities.length === 0) {
    return <p className="text-sm text-muted-foreground">No saved ESPN logins.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {identities.map((identity) => (
        <EspnIdentityRow key={identity.id} identity={identity} />
      ))}
    </ul>
  );
}
