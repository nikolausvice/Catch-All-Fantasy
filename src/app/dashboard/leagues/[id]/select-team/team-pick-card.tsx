"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { AvatarImage } from "@/components/avatar-image";
import type { LeagueTeamSummary } from "@/lib/leagues/types";
import { setUserTeam } from "../actions";

export function TeamPickCard({
  leagueRowId,
  team,
  isSelected,
}: {
  leagueRowId: string;
  team: LeagueTeamSummary;
  isSelected: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await setUserTeam({
            leagueRowId,
            teamId: team.id,
            teamName: team.name,
          });
          router.push(`/dashboard/leagues/${leagueRowId}`);
        })
      }
      className={cn(
        "flex min-h-[44px] w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors disabled:opacity-60",
        isSelected
          ? "border-2 border-primary bg-card"
          : "border-border bg-card hover:bg-muted",
      )}
    >
      <AvatarImage
        name={team.name}
        avatarUrl={team.avatarUrl}
        className="size-10 shrink-0 rounded-md"
        fallbackClassName="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{team.name}</p>
        <p className="text-xs text-muted-foreground">
          {team.wins}-{team.losses}
          {team.ties ? `-${team.ties}` : ""}
        </p>
      </div>
      {isPending ? (
        <span className="shrink-0 text-xs text-muted-foreground">Saving…</span>
      ) : isSelected ? (
        <Check className="size-5 shrink-0 text-primary" />
      ) : null}
    </button>
  );
}
