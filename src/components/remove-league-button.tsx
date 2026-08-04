"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeConnectedLeague } from "@/app/dashboard/actions";

export function RemoveLeagueButton({
  leagueRowId,
  leagueName,
  redirectTo = "/dashboard",
}: {
  leagueRowId: string;
  leagueName: string;
  /** Where to navigate after removal — pass null to stay put (e.g. a settings list that
   * still has other rows to show) instead of the default "back to the dashboard". */
  redirectTo?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Remove "${leagueName}" from your dashboard? This can't be undone.`)) {
          return;
        }
        startTransition(async () => {
          await removeConnectedLeague(leagueRowId);
          if (redirectTo) router.push(redirectTo);
          else router.refresh();
        });
      }}
      className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
    >
      {pending ? "Removing…" : "Remove league"}
    </button>
  );
}
