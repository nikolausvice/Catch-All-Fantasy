import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues } from "@/db/schema";
import { getNflGameStatuses, type GameStatus } from "@/lib/leagues/nfl-schedule";
import { getScoreOverrides } from "@/lib/leagues/score-overrides";
import { getCurrentNflWeek } from "@/lib/leagues/week";
import { AvatarImage } from "@/components/avatar-image";
import { DemoScoreEditor } from "@/components/demo-score-editor";
import { RemoveLeagueButton } from "@/components/remove-league-button";
import { loadMatchup } from "../../_load-matchup";
import type { LeagueTeam, LeagueTeamPlayer } from "@/lib/leagues/types";

const PLATFORM_LABEL: Record<string, string> = {
  sleeper: "Sleeper",
  espn: "ESPN",
  yahoo: "Yahoo",
  demo: "Demo",
};

function record(team: { wins: number; losses: number; ties: number }): string {
  return `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""}`;
}

function TeamAvatar({
  name,
  avatarUrl,
  size = "md",
}: {
  name: string;
  avatarUrl: string | null;
  size?: "sm" | "md";
}) {
  const cls = size === "sm" ? "size-7" : "size-9";
  return (
    <AvatarImage
      name={name}
      avatarUrl={avatarUrl}
      className={`${cls} shrink-0 rounded-md`}
      fallbackClassName={`${cls} flex shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground`}
    />
  );
}

// Compound flex-eligible slot names (e.g. ESPN's "RB/WR/TE") are too wide for
// the fixed-width slot column — collapse them to the conventional "FLEX" label.
const SLOT_DISPLAY: Record<string, string> = {
  "RB/WR/TE": "FLEX",
  "RB/WR": "FLEX",
  "WR/TE": "FLEX",
  "D/ST": "DST",
};

function slotLabel(slot: string): string {
  return SLOT_DISPLAY[slot] ?? slot;
}

interface RosterRow {
  slot: string | null;
  mine: LeagueTeamPlayer | undefined;
  theirs: LeagueTeamPlayer | undefined;
}

/**
 * Pairs both rosters slot-for-slot (starters by lineup order, bench by
 * index) so they can render as one mirrored list instead of two side-by-side
 * panels — the side-by-side layout squeezed unreadably on mobile.
 */
function pairRosters(mine: LeagueTeamPlayer[], theirs: LeagueTeamPlayer[]): RosterRow[] {
  const myStarters = mine.filter((p) => p.isStarter);
  const theirStarters = theirs.filter((p) => p.isStarter);
  const myBench = mine.filter((p) => !p.isStarter);
  const theirBench = theirs.filter((p) => !p.isStarter);

  const rows: RosterRow[] = [];
  const starterCount = Math.max(myStarters.length, theirStarters.length);
  for (let i = 0; i < starterCount; i++) {
    const m = myStarters[i];
    const t = theirStarters[i];
    rows.push({ slot: (m ?? t)?.slot ?? null, mine: m, theirs: t });
  }

  const benchCount = Math.max(myBench.length, theirBench.length);
  for (let i = 0; i < benchCount; i++) {
    rows.push({ slot: "BN", mine: myBench[i], theirs: theirBench[i] });
  }

  return rows;
}

// Fixed 5-column template shared by the header and every row, so the two
// point columns and the slot spine land in exactly the same place on every
// line regardless of name length — that's what makes it read as "aligned."
const ROSTER_GRID_COLS =
  "grid-cols-[2rem_1fr_2.25rem_1fr_2rem] sm:grid-cols-[2.5rem_1fr_2.75rem_1fr_2.5rem]";

// Subtle per-position tint so the eye can group QB/RB/WR/etc. rows at a
// glance. Keyed by the post-slotLabel display name (FLEX/DST already
// collapsed). Deliberately low-opacity so it holds up in both themes.
const POSITION_SHADE: Record<string, string> = {
  QB: "bg-blue-500/5",
  RB: "bg-emerald-500/5",
  WR: "bg-amber-500/5",
  TE: "bg-violet-500/5",
  FLEX: "bg-cyan-500/5",
  SUPER_FLEX: "bg-cyan-500/5",
  DST: "bg-red-500/5",
  DEF: "bg-red-500/5",
  K: "bg-orange-500/5",
};

function slotShade(slot: string | null): string {
  if (!slot) return "";
  return POSITION_SHADE[slotLabel(slot)] ?? "";
}

// Team defenses ("DEF"/"D/ST"/"DST" across platforms) are the one roster
// slot that isn't a person — abbreviating "New York Jets" to "N. Jets" reads
// worse than just "Jets", so they get last-word-only instead of "F. Last".
// Individual defensive players (IDP leagues) and kickers/punters are real
// people and get the normal treatment.
function isTeamDefense(position: string | null): boolean {
  const p = (position ?? "").toUpperCase().trim();
  return p === "DEF" || p === "D/ST" || p === "DST";
}

function abbreviatedName(player: LeagueTeamPlayer): string {
  const name = player.name.trim();
  const words = name.split(/\s+/);

  if (isTeamDefense(player.position)) {
    return words[words.length - 1] || name;
  }
  if (words.length < 2) return name;
  return `${words[0].charAt(0)}. ${words.slice(1).join(" ")}`;
}

function PlayerName({
  player,
  align,
}: {
  player: LeagueTeamPlayer | undefined;
  align: "left" | "right";
}) {
  if (!player) {
    return (
      <p className={`truncate text-sm text-muted-foreground/40 ${align === "right" ? "text-right" : ""}`}>
        —
      </p>
    );
  }
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <p className="truncate text-sm font-medium">{abbreviatedName(player)}</p>
      {player.proTeam && (
        <p className="truncate text-[11px] text-muted-foreground">{player.proTeam}</p>
      )}
    </div>
  );
}

function PointsCell({ player, align }: { player: LeagueTeamPlayer | undefined; align: "left" | "right" }) {
  return (
    <span
      className={`shrink-0 text-xs font-semibold tabular-nums text-muted-foreground ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {player?.points !== undefined ? player.points.toFixed(1) : ""}
    </span>
  );
}

function MirroredRoster({ team, opponent }: { team: LeagueTeam; opponent: LeagueTeam }) {
  const rows = pairRosters(team.players, opponent.players);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className={`grid ${ROSTER_GRID_COLS} items-center gap-1.5 border-b border-border px-2 py-2.5 sm:gap-2 sm:px-3`}>
        <p className="col-span-2 min-w-0 truncate text-right text-sm font-semibold">{team.name}</p>
        <span />
        <p className="col-span-2 min-w-0 truncate text-sm font-semibold">{opponent.name}</p>
      </div>
      <div className="flex flex-col">
        {rows.map((row, i) => (
          <div
            key={i}
            className={`grid ${ROSTER_GRID_COLS} items-center gap-1.5 border-b border-border/40 px-2 py-2 last:border-0 sm:gap-2 sm:px-3 ${slotShade(row.slot)}`}
          >
            <PointsCell player={row.mine} align="right" />
            <PlayerName player={row.mine} align="right" />
            <span className="text-center text-[10px] font-semibold uppercase text-muted-foreground">
              {row.slot ? slotLabel(row.slot) : ""}
            </span>
            <PlayerName player={row.theirs} align="left" />
            <PointsCell player={row.theirs} align="left" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const league = await db.query.connectedLeagues.findFirst({
    where: and(
      eq(connectedLeagues.id, id),
      eq(connectedLeagues.userId, userId),
    ),
  });

  if (!league) notFound();
  if (!league.userTeamId) redirect(`/dashboard/leagues/${id}/select-team`);

  const week = await getCurrentNflWeek();
  const scoreOverrides = await getScoreOverrides(userId);
  const { matchup, error } = await loadMatchup(league, userId, week, scoreOverrides);

  const statusByTeam =
    matchup && league.platform !== "demo"
      ? await getNflGameStatuses(Number(league.season), matchup.week)
      : new Map<string, GameStatus>();
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {league.leagueName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {PLATFORM_LABEL[league.platform] ?? league.platform} ·{" "}
              {league.season}
              {matchup ? ` · Week ${matchup.week}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {league.platform !== "demo" && (
              <Link
                href={`/dashboard/leagues/${id}/select-team`}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Switch team
              </Link>
            )}
            <RemoveLeagueButton leagueRowId={id} leagueName={league.leagueName} />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {league.platform === "demo" && matchup && (
        <DemoScoreEditor leagueRowId={id} matchup={matchup} />
      )}

      {matchup && (
        <>
          {/* Score panel — left/right split */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-border bg-card p-3 sm:gap-3 sm:p-4">
            {/* User team */}
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex w-full items-center gap-2">
                <TeamAvatar
                  name={matchup.team.name}
                  avatarUrl={matchup.team.avatarUrl}
                />
                <p className="min-w-0 flex-1 truncate font-semibold">{matchup.team.name}</p>
              </div>
              {matchup.teamScore != null && (
                <p className="text-2xl font-bold tabular-nums sm:text-3xl">
                  {matchup.teamScore.toFixed(1)}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {matchup.teamProjectedScore != null && `proj ${matchup.teamProjectedScore.toFixed(1)} · `}
                {record(matchup.team)}
              </p>
            </div>

            <span className="text-xs font-semibold uppercase text-muted-foreground">
              vs
            </span>

            {/* Opponent */}
            {matchup.opponent ? (
              <div className="flex min-w-0 flex-col items-end gap-1 text-right">
                <div className="flex w-full items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-semibold">
                    {matchup.opponent.name}
                  </p>
                  <TeamAvatar
                    name={matchup.opponent.name}
                    avatarUrl={matchup.opponent.avatarUrl}
                  />
                </div>
                {matchup.opponentScore != null && (
                  <p className="text-2xl font-bold tabular-nums sm:text-3xl">
                    {matchup.opponentScore.toFixed(1)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {matchup.opponentProjectedScore != null &&
                    `proj ${matchup.opponentProjectedScore.toFixed(1)} · `}
                  {record(matchup.opponent)}
                </p>
              </div>
            ) : (
              <div className="flex min-w-0 flex-col items-end gap-1 text-right">
                <div className="flex w-full items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-semibold text-muted-foreground">
                    Bye week
                  </p>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                    –
                  </div>
                </div>
                <p className="text-2xl font-bold tabular-nums text-muted-foreground/40 sm:text-3xl">
                  –
                </p>
                <p className="text-xs text-muted-foreground">&nbsp;</p>
              </div>
            )}
          </div>

          {/* Roster — bye weeks reuse the same mirrored layout with an empty
              opponent side, rather than a different single-panel view, so
              the page doesn't visually reshuffle just because of a bye. */}
          <MirroredRoster
            team={matchup.team}
            opponent={
              matchup.opponent ?? {
                id: "",
                name: "Bye",
                avatarUrl: null,
                wins: 0,
                losses: 0,
                ties: 0,
                players: [],
              }
            }
          />
        </>
      )}
    </div>
  );
}
