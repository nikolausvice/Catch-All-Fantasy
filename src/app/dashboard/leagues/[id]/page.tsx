import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues, platformIdentities } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto/secrets";
import { EspnApiError } from "@/lib/espn/client";
import { getCachedEspnTeamMatchup, getCachedSleeperTeamMatchup } from "@/lib/leagues/cache";
import { computeMatchupWinProb } from "@/lib/leagues/cross-league";
import { getCurrentNflWeek } from "@/lib/leagues/week";
import { SleeperApiError } from "@/lib/sleeper/client";
import { AvatarImage } from "@/components/avatar-image";
import type { LeagueMatchup, LeagueTeam, LeagueTeamPlayer } from "@/lib/leagues/types";

const PLATFORM_LABEL: Record<string, string> = {
  sleeper: "Sleeper",
  espn: "ESPN",
  yahoo: "Yahoo",
};

async function loadMatchup(
  league: typeof connectedLeagues.$inferSelect,
  userId: string,
): Promise<{ matchup: LeagueMatchup | null; error: string | null }> {
  try {
    if (league.platform === "sleeper") {
      const week = await getCurrentNflWeek();
      return {
        matchup: await getCachedSleeperTeamMatchup(
          league.platformLeagueId,
          league.userTeamId!,
          week,
        ),
        error: null,
      };
    }

    if (league.platform === "espn") {
      let espnS2: string | undefined;
      let swid: string | undefined;

      if (league.platformUserId) {
        const identity = await db.query.platformIdentities.findFirst({
          where: and(
            eq(platformIdentities.userId, userId),
            eq(platformIdentities.platform, "espn"),
            eq(platformIdentities.platformUserId, league.platformUserId),
          ),
        });
        if (identity?.encryptedSecret) {
          espnS2 = decryptSecret(identity.encryptedSecret);
          swid = identity.platformUserId;
        }
      }

      return {
        matchup: await getCachedEspnTeamMatchup(
          Number(league.platformLeagueId),
          Number(league.season),
          league.userTeamId!,
          espnS2,
          swid,
        ),
        error: null,
      };
    }

    return { matchup: null, error: "Yahoo leagues aren't supported yet." };
  } catch (err) {
    if (err instanceof SleeperApiError || err instanceof EspnApiError) {
      return { matchup: null, error: err.message };
    }
    throw err;
  }
}

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

function PlayerList({
  players,
  title,
}: {
  players: LeagueTeamPlayer[];
  title: string;
}) {
  if (players.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <ul className="flex flex-col">
        {players.map((player) => (
          <li
            key={player.id}
            className="flex items-center gap-2 border-b border-border/50 py-1.5 text-sm last:border-0"
          >
            {player.slot && (
              <span className="w-10 shrink-0 text-[11px] font-semibold uppercase text-muted-foreground">
                {slotLabel(player.slot)}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{player.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {[player.position, player.proTeam].filter(Boolean).join(" · ")}
            </span>
            {player.points !== undefined && (
              <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums">
                {player.points.toFixed(1)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RosterPanel({ team }: { team: LeagueTeam }) {
  const starters = team.players.filter((p) => p.isStarter);
  const bench = team.players.filter((p) => !p.isStarter);

  if (starters.length === 0) {
    return <PlayerList players={bench} title="Players" />;
  }

  return (
    <div className="flex flex-col gap-5">
      <PlayerList players={starters} title="Starters" />
      <PlayerList players={bench} title="Bench" />
    </div>
  );
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

function PlayerSide({
  player,
  align,
}: {
  player: LeagueTeamPlayer | undefined;
  align: "left" | "right";
}) {
  const isRight = align === "right";

  if (!player) {
    return (
      <div className={`flex min-w-0 ${isRight ? "justify-end" : ""}`}>
        <span className="text-sm text-muted-foreground/40">—</span>
      </div>
    );
  }

  const nameBlock = (
    <div className={`min-w-0 ${isRight ? "text-right" : ""}`}>
      <p className="truncate text-sm font-medium">{player.name}</p>
      <p className="truncate text-[11px] text-muted-foreground">
        {[player.position, player.proTeam].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
  const pointsBadge =
    player.points !== undefined ? (
      <span className="w-9 shrink-0 text-center text-xs font-semibold tabular-nums">
        {player.points.toFixed(1)}
      </span>
    ) : (
      <span className="w-9 shrink-0" />
    );

  return (
    <div className={`flex min-w-0 items-center gap-2 ${isRight ? "justify-end" : ""}`}>
      {isRight ? (
        <>
          {pointsBadge}
          {nameBlock}
        </>
      ) : (
        <>
          {nameBlock}
          {pointsBadge}
        </>
      )}
    </div>
  );
}

function MirroredRoster({ team, opponent }: { team: LeagueTeam; opponent: LeagueTeam }) {
  const rows = pairRosters(team.players, opponent.players);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 grid grid-cols-[1fr_2.75rem_1fr] items-center gap-2">
        <p className="truncate text-right text-sm font-semibold">{team.name}</p>
        <span />
        <p className="truncate text-sm font-semibold">{opponent.name}</p>
      </div>
      <div className="flex flex-col">
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_2.75rem_1fr] items-center gap-2 border-b border-border/50 py-2 last:border-0"
          >
            <PlayerSide player={row.mine} align="right" />
            <span className="shrink-0 text-center text-[10px] font-semibold uppercase text-muted-foreground">
              {row.slot ? slotLabel(row.slot) : ""}
            </span>
            <PlayerSide player={row.theirs} align="left" />
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

  const { matchup, error } = await loadMatchup(league, userId);

  const winProb = matchup ? computeMatchupWinProb(matchup) : null;
  const winPct = winProb ? Math.round(winProb.winProbability * 100) : 0;
  const winBarColor =
    winPct >= 60 ? "bg-emerald-500" : winPct <= 40 ? "bg-red-500" : "bg-amber-400";
  const winTextColor =
    winPct >= 60
      ? "text-emerald-500"
      : winPct <= 40
        ? "text-red-500"
        : "text-amber-500";

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
        <div className="mt-2 flex items-start justify-between gap-3">
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
            <Link
              href={`/dashboard/leagues/${id}/select-team`}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Switch team
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {matchup && (
        <>
          {/* Score panel — left/right split */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-border bg-card p-4">
            {/* User team */}
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Your team
              </p>
              <div className="flex items-center gap-2">
                <TeamAvatar
                  name={matchup.team.name}
                  avatarUrl={matchup.team.avatarUrl}
                />
                <p className="truncate font-semibold">{matchup.team.name}</p>
              </div>
              {matchup.teamScore != null && (
                <p className="text-3xl font-bold tabular-nums">
                  {matchup.teamScore.toFixed(1)}
                  {matchup.teamProjectedScore != null && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      (proj {matchup.teamProjectedScore.toFixed(1)})
                    </span>
                  )}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {record(matchup.team)}
              </p>
            </div>

            <span className="text-xs font-semibold uppercase text-muted-foreground">
              vs
            </span>

            {/* Opponent */}
            {matchup.opponent ? (
              <div className="flex flex-col items-end gap-1 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Opponent
                </p>
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold">
                    {matchup.opponent.name}
                  </p>
                  <TeamAvatar
                    name={matchup.opponent.name}
                    avatarUrl={matchup.opponent.avatarUrl}
                  />
                </div>
                {matchup.opponentScore != null && (
                  <p className="text-3xl font-bold tabular-nums">
                    {matchup.opponentScore.toFixed(1)}
                    {matchup.opponentProjectedScore != null && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        (proj {matchup.opponentProjectedScore.toFixed(1)})
                      </span>
                    )}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {record(matchup.opponent)}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-end gap-1 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Opponent
                </p>
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-muted-foreground">
                    Bye week
                  </p>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                    –
                  </div>
                </div>
                <p className="text-3xl font-bold tabular-nums text-muted-foreground/40">
                  –
                </p>
                <p className="text-xs text-muted-foreground">&nbsp;</p>
              </div>
            )}
          </div>

          {winProb && !winProb.isBye && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <p className="shrink-0 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Win prob
              </p>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all ${winBarColor}`}
                  style={{ width: `${winPct}%` }}
                />
              </div>
              <span className={`w-10 shrink-0 text-right text-sm font-bold tabular-nums ${winTextColor}`}>
                {winPct}%
              </span>
            </div>
          )}

          {/* Roster */}
          {matchup.opponent ? (
            <MirroredRoster team={matchup.team} opponent={matchup.opponent} />
          ) : (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-4 text-sm font-semibold">Your lineup</h2>
              <RosterPanel team={matchup.team} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
