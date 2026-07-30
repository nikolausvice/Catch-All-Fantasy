"use client";

import { useTransition } from "react";
import { setUserTeam } from "./actions";

export function SelectTeamButton({
  leagueRowId,
  teamId,
  teamName,
  isSelected,
}: {
  leagueRowId: string;
  teamId: string;
  teamName: string;
  isSelected: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending || isSelected}
      onClick={() =>
        startTransition(() => {
          void setUserTeam({ leagueRowId, teamId, teamName });
        })
      }
      className={
        isSelected
          ? "inline-flex items-center justify-center rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
          : "inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
      }
    >
      {isSelected ? "Your team" : isPending ? "Saving…" : "This is my team"}
    </button>
  );
}
