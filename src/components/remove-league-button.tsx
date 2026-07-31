"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeConnectedLeague } from "@/app/dashboard/actions";

export function RemoveLeagueButton({
  leagueRowId,
  leagueName,
}: {
  leagueRowId: string;
  leagueName: string;
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
          router.push("/dashboard");
        });
      }}
      className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
    >
      {pending ? "Removing…" : "Remove league"}
    </button>
  );
}
