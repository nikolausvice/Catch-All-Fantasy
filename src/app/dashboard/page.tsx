import Link from "next/link";
import { Fragment } from "react";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues, platformIdentities } from "@/db/schema";
import { AddLeagueButton } from "@/components/add-league-button";
import { AnalysisSection, WinScenariosSection } from "@/components/analysis-section";
import { AvatarImage } from "@/components/avatar-image";
import { IntelTabs } from "@/components/intel-tabs";
import { RemoveLeagueButton } from "@/components/remove-league-button";
import { VennExplorer } from "@/components/venn-diagram";
import type { VennComboInfo, VennSetInfo } from "@/components/venn-diagram";
import { analyzeCrossLeague, isRemaining } from "@/lib/leagues/cross-league";
import { getNflGameStatuses, type GameStatus } from "@/lib/leagues/nfl-schedule";
import {
  buildRosterSets,
  computeOverlapCombos,
  type LeagueRosterSet,
} from "@/lib/leagues/roster-overlap";
import { getScoreOverrides } from "@/lib/leagues/score-overrides";
import { getCurrentNflWeek } from "@/lib/leagues/week";
import { loadMatchup } from "./_load-matchup";
import type { LeagueMatchup } from "@/lib/leagues/types";

const PLATFORM_LABEL: Record<string, string> = {
  sleeper: "Sleeper",
  espn: "ESPN",
  yahoo: "Yahoo",
  demo: "Demo",
};

// Own + opponent teams share this cap, so it needs to cover roughly double
// a user's actual league count — otherwise some of their leagues silently
// drop out of the overlap/projection analysis. 16 covers up to 8 leagues at
// the combinatorial cap in computeOverlapCombos (2^16 = 65536, still fast).
const MAX_OVERLAP_LEAGUES = 16;

type LeagueRow = typeof connectedLeagues.$inferSelect;

/**
 * Combines "your teams" and "this week's opponents" into one overlap
 * universe (own + opponent rosters together), so a single unified diagram
 * can show every kind of overlap — teammates shared between your own
 * leagues, players shared between opponents, and the cross-side conflicts
 * (your starter in one league, an opponent's starter in another). Own and
 * opponent sets share the same underlying leagueId, so each side gets a
 * distinct suffixed id here.
 */
function toOverlapViewData(
  ownRosterSets: LeagueRosterSet[],
  opponentRosterSets: LeagueRosterSet[],
): { sets: VennSetInfo[]; combos: VennComboInfo[] } {
  const combined = [
    ...ownRosterSets.map((s) => ({ ...s, leagueId: `${s.leagueId}:own` })),
    ...opponentRosterSets.map((s) => ({ ...s, leagueId: `${s.leagueId}:opp` })),
  ];
  const used =
    combined.length > MAX_OVERLAP_LEAGUES ? combined.slice(0, MAX_OVERLAP_LEAGUES) : combined;

  const setById = new Map(used.map((s) => [s.leagueId, s]));

  const combos = computeOverlapCombos(used).map((combo) => ({
    leagueIds: combo.leagueIds,
    players: combo.playerIds.map((id) => {
      // The "same" player can carry a different projection in each league
      // context they're rostered in (different platform, different scoring
      // settings). Gather every context this exclusive combo covers so the
      // net value can sum them — own-side contexts add, opponent-side
      // contexts subtract, since e.g. two opposing rosters both starting
      // this player compounds how much they can hurt you.
      const contexts = combo.leagueIds.map((leagueId) => {
        const info = setById.get(leagueId)!.players.get(id)!;
        return { leagueId, isOwn: leagueId.endsWith(":own"), projectedPoints: info.projectedPoints ?? 0, info };
      });
      const first = contexts[0].info;
      const netValue = contexts.reduce(
        (sum, c) => sum + (c.isOwn ? c.projectedPoints : -c.projectedPoints),
        0,
      );
      const leagueValues = Object.fromEntries(
        contexts.map((c) => [c.leagueId, c.isOwn ? c.projectedPoints : -c.projectedPoints]),
      );
      return {
        id,
        name: first.name,
        position: first.position,
        proTeam: first.proTeam,
        netValue,
        leagueValues,
      };
    }),
  }));

  const sets: VennSetInfo[] = used.map((s) => {
    const isOwn = s.leagueId.endsWith(":own");
    return {
      leagueId: s.leagueId,
      label: s.teamName,
      size: s.playerIds.size,
      side: isOwn ? "own" : "opponent",
    };
  });

  return { sets, combos };
}

// ── Matchups tab ─────────────────────────────────────────────────────────────

function TeamRow({
  name,
  avatarUrl,
  score,
  projectedScore,
  isBye,
  scoreStatus,
}: {
  name: string;
  avatarUrl: string | null;
  score: number | null;
  projectedScore?: number;
  isBye?: boolean;
  /** Colors the score green when this team currently leads, red when
   * behind — same win/loss colors as the Outcomes tab, so "ahead" reads the
   * same way everywhere. undefined (a tie, or no opponent to compare to)
   * leaves the score in the plain default color; neither side is "ahead"
   * of a tie. */
  scoreStatus?: "ahead" | "behind";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {isBye ? (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
            –
          </div>
        ) : (
          <AvatarImage
            name={name}
            avatarUrl={avatarUrl}
            className="size-9 shrink-0 rounded-md"
            fallbackClassName="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground"
          />
        )}
        <div className="min-w-0">
          <p className={`truncate text-sm font-medium ${isBye ? "text-muted-foreground" : ""}`}>
            {name}
          </p>
          {projectedScore != null && (
            <p className="truncate text-[11px] text-muted-foreground">
              proj {projectedScore.toFixed(1)}
            </p>
          )}
        </div>
      </div>
      <p
        className={`shrink-0 text-2xl font-bold tabular-nums ${
          isBye ? "text-muted-foreground/40" : ""
        }`}
        style={
          scoreStatus === "ahead"
            ? { color: "var(--color-outcome-win)" }
            : scoreStatus === "behind"
            ? { color: "var(--color-outcome-loss)" }
            : undefined
        }
      >
        {score != null ? score.toFixed(1) : "–"}
      </p>
    </div>
  );
}

function MatchupCard({
  league,
  matchup,
  error,
  statusByTeam,
}: {
  league: LeagueRow;
  matchup: LeagueMatchup | null;
  error: string | null;
  statusByTeam: Map<string, GameStatus>;
}) {
  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{league.leagueName}</p>
            <p className="mt-1 text-xs text-destructive">{error}</p>
          </div>
          <RemoveLeagueButton
            leagueRowId={league.id}
            leagueName={league.leagueName}
            redirectTo={null}
          />
        </div>
        {league.platform === "espn" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Sign in again via <span className="font-medium">+ Add league</span> above to restore
            it instead.
          </p>
        )}
      </div>
    );
  }

  if (!matchup) return null;

  // Demo leagues are hand-typed fake data — a real NFL team's live game
  // status shouldn't override a score the user typed in by hand, same
  // exception cross-league.ts makes everywhere else it reads this map.
  const status = league.platform === "demo" ? undefined : statusByTeam;
  const remainingCount =
    matchup.team.players.filter((p) => isRemaining(p, status)).length +
    (matchup.opponent?.players.filter((p) => isRemaining(p, status)).length ?? 0);

  // Only meaningful with a real opponent and two real scores to compare —
  // a bye, or a score not yet reported by the platform, is neither "ahead"
  // nor "behind" anything.
  let teamStatus: "ahead" | "behind" | undefined;
  let opponentStatus: "ahead" | "behind" | undefined;
  if (matchup.opponent && matchup.teamScore != null && matchup.opponentScore != null) {
    if (matchup.teamScore > matchup.opponentScore) {
      teamStatus = "ahead";
      opponentStatus = "behind";
    } else if (matchup.teamScore < matchup.opponentScore) {
      teamStatus = "behind";
      opponentStatus = "ahead";
    }
  }

  return (
    <Link
      href={`/dashboard/leagues/${league.id}`}
      className="block min-h-[44px] rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-muted-foreground">
          {league.leagueName}
        </p>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {PLATFORM_LABEL[league.platform] ?? league.platform} · Wk {matchup.week}
        </span>
      </div>
      <TeamRow
        name={matchup.team.name}
        avatarUrl={matchup.team.avatarUrl}
        score={matchup.teamScore}
        projectedScore={matchup.teamProjectedScore}
        scoreStatus={teamStatus}
      />

      <div className="my-2 flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">vs</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {matchup.opponent ? (
        <TeamRow
          name={matchup.opponent.name}
          avatarUrl={matchup.opponent.avatarUrl}
          score={matchup.opponentScore}
          projectedScore={matchup.opponentProjectedScore}
          scoreStatus={opponentStatus}
        />
      ) : (
        <TeamRow name="Bye" avatarUrl={null} score={null} isBye />
      )}

      {matchup.opponent && (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          {remainingCount === 0
            ? "All players have finished"
            : `${remainingCount} player${remainingCount === 1 ? "" : "s"} left to play`}
        </p>
      )}
    </Link>
  );
}

function MatchupsTab({
  needsSetup,
  needsReconnectIds,
  matchups,
  statusByTeam,
}: {
  needsSetup: LeagueRow[];
  needsReconnectIds: Set<string>;
  matchups: { league: LeagueRow; matchup: LeagueMatchup | null; error: string | null }[];
  statusByTeam: Map<string, GameStatus>;
}) {
  return (
    <Fragment key="matchups">
      {needsSetup.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Finish setup
          </h2>
          <ul className="flex flex-col gap-3">
            {needsSetup.map((league) => {
              const needsReconnect = needsReconnectIds.has(league.id);
              return (
                <li
                  key={league.id}
                  className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-card p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{league.leagueName}</p>
                    <p className="text-xs text-muted-foreground">
                      {PLATFORM_LABEL[league.platform] ?? league.platform} ·{" "}
                      {league.season}
                      {needsReconnect && (
                        <span className="text-destructive">
                          {" "}
                          · No saved ESPN login for this league — sign in again via + Add league
                        </span>
                      )}
                    </p>
                  </div>
                  {needsReconnect ? (
                    <RemoveLeagueButton
                      leagueRowId={league.id}
                      leagueName={league.leagueName}
                      redirectTo={null}
                    />
                  ) : (
                    <Link
                      href={`/dashboard/leagues/${league.id}/select-team`}
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                    >
                      Pick your team →
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {matchups.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            This week
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {matchups.map(({ league, matchup, error }) => (
              <li key={league.id}>
                <MatchupCard
                  league={league}
                  matchup={matchup}
                  error={error}
                  statusByTeam={statusByTeam}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

    </Fragment>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const leagues = await db
    .select()
    .from(connectedLeagues)
    .where(eq(connectedLeagues.userId, userId))
    .orderBy(desc(connectedLeagues.createdAt));

  const needsSetup = leagues.filter((league) => !league.userTeamId);
  const ready = leagues.filter((league) => league.userTeamId);

  // Leagues that need setup never attempt a live ESPN fetch on this page (that only
  // happens once a team's picked), so a missing saved login would otherwise go
  // unnoticed until the user clicks through to a dead end. Check for it up front instead.
  const espnIdentities = await db.query.platformIdentities.findMany({
    where: and(eq(platformIdentities.userId, userId), eq(platformIdentities.platform, "espn")),
    columns: { platformUserId: true },
  });
  const validEspnSwids = new Set(espnIdentities.map((i) => i.platformUserId));
  const needsReconnectIds = new Set(
    needsSetup
      .filter((l) => l.platform === "espn" && l.platformUserId && !validEspnSwids.has(l.platformUserId))
      .map((l) => l.id),
  );

  const week = ready.length > 0 ? await getCurrentNflWeek() : 0;
  const season = Number(ready.find((l) => l.platform !== "demo")?.season) || new Date().getFullYear();
  const statusByTeam: Map<string, GameStatus> =
    week > 0 ? await getNflGameStatuses(season, week) : new Map();
  const scoreOverrides = await getScoreOverrides(userId);

  const matchups = await Promise.all(
    ready.map(async (league) => ({
      leagueId: league.id,
      leagueName: league.leagueName,
      platform: league.platform,
      league,
      ...(await loadMatchup(league, userId, week, scoreOverrides)),
    })),
  );

  const analysis = analyzeCrossLeague(
    matchups.map(({ leagueId, leagueName, platform, matchup }) => ({
      leagueId,
      leagueName,
      platform,
      matchup,
    })),
    statusByTeam,
  );

  const ownRosterSets = buildRosterSets(matchups, "own");
  const opponentRosterSets = buildRosterSets(matchups, "opponent");
  const overlap = toOverlapViewData(ownRosterSets, opponentRosterSets);

  return (
    <div className="flex flex-col gap-6">
      {leagues.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No leagues connected yet.</p>
          <AddLeagueButton
            hasStoredEspnCookies={espnIdentities.length > 0}
            label="+ Add your first league"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          />
        </div>
      ) : (
        <IntelTabs
          overview={
            <Fragment key="overview">
              <WinScenariosSection
                winCountDistribution={analysis.totalMatchups > 1 ? analysis.winCountDistribution : null}
              />
              <MatchupsTab
                needsSetup={needsSetup}
                needsReconnectIds={needsReconnectIds}
                matchups={matchups}
                statusByTeam={statusByTeam}
              />
            </Fragment>
          }
          rootingAndOverlap={
            <VennExplorer sets={overlap.sets} combos={overlap.combos} />
          }
          outcomeLandscape={<AnalysisSection analysis={analysis} />}
        />
      )}
    </div>
  );
}
