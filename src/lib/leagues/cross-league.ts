import { type GameStatus, normalizeTeamAbbrev } from "./nfl-schedule";
import { normalizePlayerKey } from "./roster-overlap";
import type { LeagueMatchup, LeagueTeamPlayer } from "./types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LeagueWinProb {
  leagueId: string;
  leagueName: string;
  platform: string;
  /** Current (live) score. */
  teamScore: number | null;
  opponentScore: number | null;
  /** Projected final score (current + remaining starters' projections). */
  teamProjectedScore: number | undefined;
  opponentProjectedScore: number | undefined;
  /**
   * Current margin (teamScore - opponentScore). Positive = you're winning.
   * null if no scores yet.
   */
  currentMargin: number | null;
  /**
   * Projected final margin. Positive = projected to win.
   * null if no projections available.
   */
  projectedMargin: number | null;
  /** 0–1. Based on projected final margin when available, current score otherwise. */
  winProbability: number;
  isBye: boolean;
}

export interface PlayerLeagueRole {
  leagueName: string;
  leagueId: string;
  role: "your-starter" | "your-bench" | "opp-starter" | "opp-bench";
  points: number | undefined;
  projectedPoints: number | undefined;
  slot: string | undefined;
}

export interface CrossLeaguePlayer {
  playerId: string;
  name: string;
  position: string | null;
  proTeam: string | null;
  leagues: PlayerLeagueRole[];
  /**
   * Net impact across all leagues, weighted by projected points.
   * your-starter: +proj, your-bench: +proj*0.25
   * opp-starter: -proj, opp-bench: -proj*0.25
   * Falls back to role weights (2 / 0.5) when no projection available.
   */
  netImpact: number;
  /** True if the player is a starter in at least one of your leagues. */
  isYourStarter: boolean;
}

/**
 * A starter who hasn't played yet (proxy: points === 0 and projectedPoints > 0)
 * and appears in conflicting roles across leagues.
 */
export interface RemainingPlayerAnalysis {
  playerId: string;
  name: string;
  position: string | null;
  proTeam: string | null;
  projectedPoints: number;
  /** Their current (live) score, if any context has reported one. */
  currentPoints: number;
  /** Per-league impact for this player. */
  leagues: {
    leagueName: string;
    leagueId: string;
    role: "your-starter" | "opp-starter";
    /**
     * Points this player needs to score for the optimal outcome in this league.
     * Positive → want them higher. Negative → want them lower.
     * Computed from projected final margins excluding this player.
     */
    breakEvenPoints: number | null;
    /** Whether you're currently on track to win this league without this player. */
    winningWithout: boolean;
    description: string;
    /**
     * True only when this player is the SOLE remaining starter (either side)
     * in this league — meaning breakEvenPoints is an exact, guaranteed
     * threshold. When other starters are also still to play, their own
     * variance can swing the league regardless of what this player does, so
     * the threshold here is only an estimate that assumes everyone else
     * hits their projection exactly.
     */
    isExact: boolean;
  }[];
  /**
   * True when the player is your starter in some leagues but opponent's
   * starter in others — their score is a genuine trade-off.
   */
  hasConflict: boolean;
  /**
   * When hasConflict is true: the range of points that satisfies the most
   * leagues simultaneously. null if no feasible sweet spot exists.
   */
  sweetSpot: { min: number; max: number } | null;
  /** True only when every league behind the sweet spot has this player as its last remaining starter. */
  sweetSpotIsExact: boolean;
  /**
   * The full breakdown: every score band this player's final tally could
   * land in, and the resulting win-loss record across every league they
   * affect (e.g. "2-0", "1-1", "0-2"). Empty when there's no conflict.
   */
  recordBands: { min: number; max: number | null; wins: number; losses: number }[];
}

export interface CrossLeagueAnalysis {
  winProbabilities: LeagueWinProb[];
  /** All players that appear anywhere across the matchups, ranked by |netImpact|. */
  playerImpacts: CrossLeaguePlayer[];
  /** Remaining starters (proxy: 0 pts + projectedPoints > 0) with cross-league analysis. */
  remainingPlayers: RemainingPlayerAnalysis[];
  /** Sum of per-league win probabilities (expected number of wins). */
  expectedWins: number;
  /** Product of individual win probs for active (non-bye) matchups. */
  probAllWins: number;
  totalMatchups: number;
  /** P(exactly k wins) for k = 0..totalMatchups, index = k. */
  winCountDistribution: number[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Logistic win probability from current score margin, used only when no
 * projections are available at all (rare — see computeMatchupWinProb).
 * Scale = 15 pts → ~73% at +15, ~50% at 0, ~27% at -15.
 */
function logisticProb(margin: number, scale = 15): number {
  return 1 / (1 + Math.exp(-margin / scale));
}

/** Standard normal CDF (Abramowitz & Stegun 26.2.17 approximation, |error| < 7.5e-8). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let prob =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) prob = 1 - prob;
  return prob;
}

/**
 * Approximate variance of a team's remaining (not-yet-played) production,
 * modeling each remaining starter's final score as normally distributed
 * around their projection with a standard deviation ~45% of that
 * projection — a rough but commonly-cited figure for single-player weekly
 * fantasy scoring variance. Players who've already played (or have no
 * projection) contribute no variance — their score is locked in.
 */
function remainingVariance(
  players: LeagueTeamPlayer[],
  statusByTeam?: Map<string, GameStatus>,
): number {
  const VARIANCE_COEFF = 0.45;
  return players
    .filter((p) => isRemaining(p, statusByTeam))
    .reduce((sum, p) => {
      const sd = (p.projectedPoints ?? 0) * VARIANCE_COEFF;
      return sum + sd * sd;
    }, 0);
}

/**
 * Win probability for a single matchup. When projections are available,
 * models the final margin as normally distributed — mean = projected
 * margin, variance = combined remaining-player variance on both sides —
 * so confidence correctly scales with how much of the week is left to
 * play (near 50/50 early when most rosters haven't played, sharpening
 * toward 0/100% as players finish). Falls back to a live-score-only
 * logistic when no projections exist at all.
 */
export function computeMatchupWinProb(
  matchup: LeagueMatchup,
  statusByTeam?: Map<string, GameStatus>,
): {
  currentMargin: number | null;
  projectedMargin: number | null;
  winProbability: number;
  isBye: boolean;
} {
  const isBye = matchup.opponent === null;

  const currentMargin =
    matchup.teamScore != null && matchup.opponentScore != null
      ? matchup.teamScore - matchup.opponentScore
      : null;

  const projectedMargin =
    matchup.teamProjectedScore != null && matchup.opponentProjectedScore != null
      ? matchup.teamProjectedScore - matchup.opponentProjectedScore
      : null;

  let winProbability: number;
  if (isBye) {
    winProbability = 1;
  } else if (projectedMargin != null) {
    const varMe = remainingVariance(matchup.team.players, statusByTeam);
    const varOpp = matchup.opponent ? remainingVariance(matchup.opponent.players, statusByTeam) : 0;
    // Floor so a matchup with nothing left to play doesn't collapse to a
    // hard 0%/100% — there's always a little residual uncertainty (stat
    // corrections, DST/K scoring the proxy above doesn't model well, etc).
    const FLOOR_SD = 3;
    const sd = Math.sqrt(varMe + varOpp + FLOOR_SD * FLOOR_SD);
    winProbability = normalCdf(projectedMargin / sd);
  } else if (currentMargin != null) {
    winProbability = logisticProb(currentMargin, 15);
  } else {
    winProbability = 0.5;
  }

  return { currentMargin, projectedMargin, winProbability, isBye };
}

/**
 * Sleeper and ESPN each hand out their own small-integer player IDs, drawn
 * from unrelated ID spaces — a Sleeper ID and an ESPN ID can collide despite
 * referring to two different real players. Namespacing by platform keeps a
 * Sleeper league's player entries from being silently merged into (and
 * masked by) an unrelated ESPN player with the same raw ID, and vice versa.
 */
function playerKey(platform: string, playerId: string): string {
  return `${platform}:${playerId}`;
}

/**
 * Whether a starter's final score isn't locked in yet. Zero fantasy points
 * looks identical whether a player hasn't played or has already played and
 * scored nothing, so when a real NFL game-status map is available, prefer
 * it: "post" (game over) means their score is final even if it's 0; "pre"
 * or "in" means it isn't, even if their live points somehow read nonzero
 * (stat corrections). Falls back to the old zero-points proxy when no
 * schedule data is available (e.g. demo leagues, or a lookup miss).
 */
function isRemaining(p: LeagueTeamPlayer, statusByTeam?: Map<string, GameStatus>): boolean {
  if (!p.isStarter) return false;
  if (statusByTeam) {
    const status = statusByTeam.get(normalizeTeamAbbrev(p.proTeam));
    if (status === "post") return false;
    if (status === "pre" || status === "in") return (p.projectedPoints ?? 0) > 0;
    // No schedule entry — team is on a bye, or the lookup missed. Fall
    // through to the proxy below.
  }
  return (p.points ?? 0) === 0 && (p.projectedPoints ?? 0) > 0;
}

/**
 * Same idea as isRemaining, but excludes players whose game is already
 * underway ("in") — used only by the simulation below, where a mid-game
 * player's current live points are already part of matchup.teamScore
 * (locked). Treating them as remaining there would draw their whole
 * projection on top of points already counted, double-counting them.
 */
function isNotYetStarted(p: LeagueTeamPlayer, statusByTeam?: Map<string, GameStatus>): boolean {
  if (!p.isStarter) return false;
  if (statusByTeam) {
    const status = statusByTeam.get(normalizeTeamAbbrev(p.proTeam));
    if (status === "post" || status === "in") return false;
    if (status === "pre") return (p.projectedPoints ?? 0) > 0;
  }
  return (p.points ?? 0) === 0 && (p.projectedPoints ?? 0) > 0;
}

/**
 * Partitions a conflicted player's possible final score into bands and
 * reports the resulting win-loss record (across every league they affect)
 * in each — e.g. "0.0–12.4 pts → 0-2", "12.4–18.6 → 1-1", "18.6+ → 2-0".
 * Each "your" league contributes a "need >= x to win" threshold; each "opp"
 * league contributes a "need <= y to win" threshold. Sorting the union of
 * thresholds splits the score axis into segments with a constant win/loss
 * count; adjacent segments with an identical record are merged. Not floored
 * at 0 — see the sweet-spot comment above for why negative bands are real.
 */
function computeRecordBands(
  yourLeagues: RemainingPlayerAnalysis["leagues"],
  oppLeagues: RemainingPlayerAnalysis["leagues"],
): { min: number; max: number | null; wins: number; losses: number }[] {
  const thresholds = new Set<number>([0]);
  for (const l of yourLeagues) thresholds.add(l.breakEvenPoints ?? 0);
  for (const l of oppLeagues) thresholds.add(l.breakEvenPoints ?? 0);
  const points = [...thresholds].sort((a, b) => a - b);

  function outcomeAt(testScore: number): { wins: number; losses: number } {
    let wins = 0;
    let losses = 0;
    for (const l of yourLeagues) {
      if (testScore >= (l.breakEvenPoints ?? 0)) wins++;
      else losses++;
    }
    for (const l of oppLeagues) {
      if (testScore <= (l.breakEvenPoints ?? 0)) wins++;
      else losses++;
    }
    return { wins, losses };
  }

  const raw: { min: number; max: number | null; wins: number; losses: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const min = points[i];
    const max = i + 1 < points.length ? points[i + 1] : null;
    const testScore = max != null ? (min + max) / 2 : min + Math.max(1, Math.abs(min) * 0.1);
    raw.push({ min, max, ...outcomeAt(testScore) });
  }

  const merged: typeof raw = [];
  for (const band of raw) {
    const prev = merged[merged.length - 1];
    if (prev && prev.wins === band.wins && prev.losses === band.losses) {
      prev.max = band.max;
    } else {
      merged.push(band);
    }
  }
  return merged;
}

/** Box-Muller standard normal sample. */
function gaussianRandom(): number {
  const u1 = Math.random() || Number.EPSILON;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const SIM_TRIALS = 10000;
const VARIANCE_COEFF = 0.45; // same rough single-player weekly-variance figure as remainingVariance
const FLOOR_SD = 3; // same residual-uncertainty floor as computeMatchupWinProb

interface SimLeague {
  lockedMine: number;
  lockedOpp: number;
  remainingMineKeys: string[];
  remainingOppKeys: string[];
}

/**
 * Monte Carlo joint-outcome simulation across all active (non-bye) leagues.
 *
 * The naive way to combine per-league win probabilities into "P(win all N)"
 * is to multiply them, treating each league as independent. That's wrong
 * whenever leagues share a player: if scoring 20+ points wins League A but
 * the same player scoring 20+ means they scored low in whatever stat wins
 * League B for an opponent who also starts them... more concretely, if a
 * shared player being your starter in one league and an opponent's starter
 * in another means one league's win literally requires the outcome the
 * other league's loss requires, the two leagues are anti-correlated —
 * sweeping both should be rarer (down to ~0% in a perfectly-opposed case)
 * than independence would suggest.
 *
 * This simulates each *unique real player* (matched the same way as
 * cross-league roster similarity: normalized name + position) exactly once
 * per trial, and reuses that single draw everywhere the player is rostered
 * as a remaining starter — your team in one league, an opponent's team in
 * another — so correlated/anti-correlated outcomes fall out naturally
 * instead of being assumed away.
 */
function simulateJointOutcomes(
  matchupResults: { leagueId: string; platform: string; matchup: LeagueMatchup | null }[],
  statusByTeam?: Map<string, GameStatus>,
): { winCountDistribution: number[]; expectedWins: number; probAllWins: number } {
  const leagues: SimLeague[] = [];
  const players = new Map<string, { mean: number; sd: number }>();

  function registerPlayer(p: LeagueTeamPlayer): string {
    const key = normalizePlayerKey(p.name, p.position);
    const mean = p.projectedPoints ?? 0;
    const existing = players.get(key);
    if (!existing || mean > existing.mean) {
      players.set(key, { mean, sd: mean * VARIANCE_COEFF });
    }
    return key;
  }

  for (const { platform, matchup } of matchupResults) {
    if (!matchup || !matchup.opponent) continue;
    // Demo leagues are hand-edited fake data — a real NFL team's live game
    // status shouldn't override the score the user actually typed in.
    const status = platform === "demo" ? undefined : statusByTeam;
    leagues.push({
      lockedMine: matchup.teamScore ?? 0,
      lockedOpp: matchup.opponentScore ?? 0,
      remainingMineKeys: matchup.team.players
        .filter((p) => isNotYetStarted(p, status))
        .map(registerPlayer),
      remainingOppKeys: matchup.opponent.players
        .filter((p) => isNotYetStarted(p, status))
        .map(registerPlayer),
    });
  }

  if (leagues.length === 0) {
    return { winCountDistribution: [1], expectedWins: 0, probAllWins: 1 };
  }

  const playerEntries = [...players.entries()];
  const winCounts = new Array(leagues.length + 1).fill(0);
  let totalWins = 0;
  let sweepCount = 0;

  for (let trial = 0; trial < SIM_TRIALS; trial++) {
    const draws = new Map<string, number>();
    for (const [key, { mean, sd }] of playerEntries) {
      draws.set(key, Math.max(0, mean + gaussianRandom() * sd));
    }

    let wins = 0;
    for (const league of leagues) {
      const mineExtra = league.remainingMineKeys.reduce((s, k) => s + (draws.get(k) ?? 0), 0);
      const oppExtra = league.remainingOppKeys.reduce((s, k) => s + (draws.get(k) ?? 0), 0);
      const finalMine = league.lockedMine + mineExtra + gaussianRandom() * FLOOR_SD;
      const finalOpp = league.lockedOpp + oppExtra + gaussianRandom() * FLOOR_SD;
      if (finalMine > finalOpp) wins++;
    }

    winCounts[wins]++;
    totalWins += wins;
    if (wins === leagues.length) sweepCount++;
  }

  return {
    winCountDistribution: winCounts.map((c) => c / SIM_TRIALS),
    expectedWins: totalWins / SIM_TRIALS,
    probAllWins: sweepCount / SIM_TRIALS,
  };
}

// ---------------------------------------------------------------------------
// Main analysis function
// ---------------------------------------------------------------------------

export function analyzeCrossLeague(
  matchupResults: {
    leagueId: string;
    leagueName: string;
    platform: string;
    matchup: LeagueMatchup | null;
  }[],
  statusByTeam?: Map<string, GameStatus>,
): CrossLeagueAnalysis {
  // ── 1. Win probabilities ────────────────────────────────────────────────

  const winProbabilities: LeagueWinProb[] = [];

  for (const { leagueId, leagueName, platform, matchup } of matchupResults) {
    if (!matchup) continue;

    // Demo leagues are hand-edited fake data — don't let a real NFL team's
    // live game status override the score the user actually typed in.
    const status = platform === "demo" ? undefined : statusByTeam;
    const { currentMargin, projectedMargin, winProbability, isBye } =
      computeMatchupWinProb(matchup, status);

    winProbabilities.push({
      leagueId,
      leagueName,
      platform,
      teamScore: matchup.teamScore,
      opponentScore: matchup.opponentScore,
      teamProjectedScore: matchup.teamProjectedScore,
      opponentProjectedScore: matchup.opponentProjectedScore,
      currentMargin,
      projectedMargin,
      winProbability,
      isBye,
    });
  }

  // ── 2. Build per-player impact map ─────────────────────────────────────

  const playerMap = new Map<string, CrossLeaguePlayer>();

  function upsert(
    player: LeagueTeamPlayer,
    role: PlayerLeagueRole["role"],
    leagueId: string,
    leagueName: string,
    platform: string,
  ) {
    const key = playerKey(platform, player.id);
    let entry = playerMap.get(key);
    if (!entry) {
      entry = {
        playerId: key,
        name: player.name,
        position: player.position,
        proTeam: player.proTeam,
        leagues: [],
        netImpact: 0,
        isYourStarter: false,
      };
      playerMap.set(key, entry);
    }

    entry.leagues.push({
      leagueName,
      leagueId,
      role,
      points: player.points,
      projectedPoints: player.projectedPoints,
      slot: player.slot,
    });

    if (role === "your-starter") entry.isYourStarter = true;

    // Weight impact by projected points (if available) or flat role weight
    const proj = player.projectedPoints ?? 0;
    const hasProj = player.projectedPoints !== undefined && player.projectedPoints > 0;

    let delta: number;
    if (hasProj) {
      delta =
        role === "your-starter" ? proj
        : role === "your-bench" ? proj * 0.25
        : role === "opp-starter" ? -proj
        : /* opp-bench */ -proj * 0.25;
    } else {
      delta =
        role === "your-starter" ? 2
        : role === "your-bench" ? 0.5
        : role === "opp-starter" ? -2
        : /* opp-bench */ -0.5;
    }

    entry.netImpact += delta;
  }

  for (const { leagueId, leagueName, platform, matchup } of matchupResults) {
    if (!matchup) continue;
    for (const p of matchup.team.players) {
      upsert(p, p.isStarter ? "your-starter" : "your-bench", leagueId, leagueName, platform);
    }
    if (matchup.opponent) {
      for (const p of matchup.opponent.players) {
        upsert(p, p.isStarter ? "opp-starter" : "opp-bench", leagueId, leagueName, platform);
      }
    }
  }

  const playerImpacts = [...playerMap.values()].sort(
    (a, b) => Math.abs(b.netImpact) - Math.abs(a.netImpact) || a.name.localeCompare(b.name),
  );

  // ── 3. Remaining player conflict analysis ───────────────────────────────

  // Build per-league projected final scores excluding each remaining player,
  // so we can compute "break-even" points for that player.
  // projectedFinalExcluding[leagueId][playerId] = { myProj, oppProj }

  type LeagueProjData = {
    myProj: number;  // projected final for my team
    oppProj: number; // projected final for opponent
  };
  const leagueProjData = new Map<string, LeagueProjData>();
  // How many starters (either side) still haven't played in each league —
  // a break-even threshold is only an exact guarantee when this is 1 (i.e.
  // this player is the very last one left to play in that league).
  const remainingCountByLeague = new Map<string, number>();

  for (const { leagueId, platform, matchup } of matchupResults) {
    if (!matchup || !matchup.opponent) continue;
    const status = platform === "demo" ? undefined : statusByTeam;
    const myRemaining = matchup.team.players.filter((p) => isRemaining(p, status));
    const oppRemaining = matchup.opponent.players.filter((p) => isRemaining(p, status));
    remainingCountByLeague.set(leagueId, myRemaining.length + oppRemaining.length);
    leagueProjData.set(leagueId, {
      myProj:
        matchup.teamProjectedScore ??
        (matchup.teamScore ?? 0) + myRemaining.reduce((s, p) => s + (p.projectedPoints ?? 0), 0),
      oppProj:
        matchup.opponentProjectedScore ??
        (matchup.opponentScore ?? 0) + oppRemaining.reduce((s, p) => s + (p.projectedPoints ?? 0), 0),
    });
  }

  // Collect all remaining starters that appear in a meaningful role
  const remainingByPlayer = new Map<string, RemainingPlayerAnalysis>();

  for (const { leagueId, leagueName, platform, matchup } of matchupResults) {
    if (!matchup || !matchup.opponent) continue;
    const proj = leagueProjData.get(leagueId);
    if (!proj) continue;
    const status = platform === "demo" ? undefined : statusByTeam;

    // My remaining starters
    for (const player of matchup.team.players) {
      if (!isRemaining(player, status)) continue;
      const pProj = player.projectedPoints!;
      const key = playerKey(platform, player.id);

      // My projected without this player
      const myWithout = proj.myProj - pProj;
      // To win: myWithout + p.actual > proj.oppProj
      const breakEven = proj.oppProj - myWithout; // need >= this to win
      const winningWithout = myWithout > proj.oppProj;

      const desc = winningWithout
        ? `Projected to win even if ${player.name} scores 0`
        : breakEven > 0
        ? `${player.name} needs ~${breakEven.toFixed(1)} pts to secure the W`
        : `Already covered — any score helps`;

      let entry = remainingByPlayer.get(key);
      if (!entry) {
        entry = {
          playerId: key,
          name: player.name,
          position: player.position,
          proTeam: player.proTeam,
          projectedPoints: pProj,
          currentPoints: player.points ?? 0,
          leagues: [],
          hasConflict: false,
          sweetSpot: null,
          sweetSpotIsExact: false,
          recordBands: [],
        };
        remainingByPlayer.set(key, entry);
      }
      // Update to highest projection/current-points seen
      if (pProj > entry.projectedPoints) entry.projectedPoints = pProj;
      if ((player.points ?? 0) > entry.currentPoints) entry.currentPoints = player.points ?? 0;

      entry.leagues.push({
        leagueName,
        leagueId,
        role: "your-starter",
        breakEvenPoints: breakEven,
        winningWithout,
        description: desc,
        isExact: remainingCountByLeague.get(leagueId) === 1,
      });
    }

    // Opponent's remaining starters
    if (matchup.opponent) {
      for (const player of matchup.opponent.players) {
        if (!isRemaining(player, status)) continue;
        const pProj = player.projectedPoints!;
        const key = playerKey(platform, player.id);

        // Opp projected without this player
        const oppWithout = proj.oppProj - pProj;
        // I win if: proj.myProj > oppWithout + p.actual
        // i.e. p.actual < proj.myProj - oppWithout
        const maxAllowed = proj.myProj - oppWithout;
        const winningWithout = proj.myProj > oppWithout;

        const desc = winningWithout
          ? `Winning even if ${player.name} scores their projection (${pProj.toFixed(1)} pts)`
          : maxAllowed > 0
          ? `${player.name} must score under ${maxAllowed.toFixed(1)} pts for you to win`
          : `Opponent wins even if ${player.name} scores 0`;

        let entry = remainingByPlayer.get(key);
        if (!entry) {
          entry = {
            playerId: key,
            name: player.name,
            position: player.position,
            proTeam: player.proTeam,
            projectedPoints: pProj,
            currentPoints: player.points ?? 0,
            leagues: [],
            hasConflict: false,
            sweetSpot: null,
            sweetSpotIsExact: false,
            recordBands: [],
          };
          remainingByPlayer.set(key, entry);
        }
        if (pProj > entry.projectedPoints) entry.projectedPoints = pProj;
        if ((player.points ?? 0) > entry.currentPoints) entry.currentPoints = player.points ?? 0;

        entry.leagues.push({
          leagueName,
          leagueId,
          role: "opp-starter",
          breakEvenPoints: maxAllowed,
          winningWithout,
          description: desc,
          isExact: remainingCountByLeague.get(leagueId) === 1,
        });
      }
    }
  }

  // Detect conflicts and compute sweet spots
  for (const entry of remainingByPlayer.values()) {
    const yourLeagues = entry.leagues.filter((l) => l.role === "your-starter");
    const oppLeagues = entry.leagues.filter((l) => l.role === "opp-starter");

    if (yourLeagues.length > 0 && oppLeagues.length > 0) {
      entry.hasConflict = true;

      // Sweet spot: [max of all your minimums, min of all opp maximums].
      // Not floored at 0 — a genuinely negative threshold ("you're covered
      // even if they bomb") is real information, not noise.
      const minNeeded = Math.max(...yourLeagues.map((l) => l.breakEvenPoints ?? 0));
      const maxAllowed = Math.min(
        entry.projectedPoints * 2, // generous upper cap
        ...oppLeagues.map((l) => l.breakEvenPoints ?? entry.projectedPoints * 2),
      );

      entry.sweetSpot =
        minNeeded <= maxAllowed ? { min: minNeeded, max: maxAllowed } : null;
      entry.sweetSpotIsExact =
        yourLeagues.every((l) => l.isExact) && oppLeagues.every((l) => l.isExact);
      entry.recordBands = computeRecordBands(yourLeagues, oppLeagues);
    }
  }

  // Sort: conflicts first (most impactful), then by projectedPoints desc
  const remainingPlayers = [...remainingByPlayer.values()]
    .filter((p) => p.leagues.length > 0)
    .sort((a, b) => {
      if (a.hasConflict !== b.hasConflict) return a.hasConflict ? -1 : 1;
      return b.projectedPoints - a.projectedPoints;
    });

  // ── 4. Aggregates ───────────────────────────────────────────────────────

  // Bye leagues have no matchup to win — excluded here (and from probAllWins/
  // totalMatchups below) so they don't get counted as a free guaranteed win.
  const activeMatchups = winProbabilities.filter((w) => !w.isBye);
  const { winCountDistribution, expectedWins, probAllWins } =
    simulateJointOutcomes(matchupResults, statusByTeam);

  return {
    winProbabilities,
    playerImpacts,
    remainingPlayers,
    expectedWins,
    probAllWins,
    totalMatchups: activeMatchups.length,
    winCountDistribution,
  };
}
