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
function remainingVariance(players: LeagueTeamPlayer[]): number {
  const VARIANCE_COEFF = 0.45;
  return players.filter(isRemaining).reduce((sum, p) => {
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
export function computeMatchupWinProb(matchup: LeagueMatchup): {
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
    const varMe = remainingVariance(matchup.team.players);
    const varOpp = matchup.opponent ? remainingVariance(matchup.opponent.players) : 0;
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

function isRemaining(p: LeagueTeamPlayer): boolean {
  return (
    p.isStarter &&
    (p.points ?? 0) === 0 &&
    (p.projectedPoints ?? 0) > 0
  );
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
): CrossLeagueAnalysis {
  // ── 1. Win probabilities ────────────────────────────────────────────────

  const winProbabilities: LeagueWinProb[] = [];

  for (const { leagueId, leagueName, platform, matchup } of matchupResults) {
    if (!matchup) continue;

    const { currentMargin, projectedMargin, winProbability, isBye } =
      computeMatchupWinProb(matchup);

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

  for (const { leagueId, matchup } of matchupResults) {
    if (!matchup || !matchup.opponent) continue;
    leagueProjData.set(leagueId, {
      myProj:
        matchup.teamProjectedScore ??
        (matchup.teamScore ?? 0) +
          matchup.team.players
            .filter(isRemaining)
            .reduce((s, p) => s + (p.projectedPoints ?? 0), 0),
      oppProj:
        matchup.opponentProjectedScore ??
        (matchup.opponentScore ?? 0) +
          matchup.opponent.players
            .filter(isRemaining)
            .reduce((s, p) => s + (p.projectedPoints ?? 0), 0),
    });
  }

  // Collect all remaining starters that appear in a meaningful role
  const remainingByPlayer = new Map<string, RemainingPlayerAnalysis>();

  for (const { leagueId, leagueName, platform, matchup } of matchupResults) {
    if (!matchup || !matchup.opponent) continue;
    const proj = leagueProjData.get(leagueId);
    if (!proj) continue;

    // My remaining starters
    for (const player of matchup.team.players) {
      if (!isRemaining(player)) continue;
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
          leagues: [],
          hasConflict: false,
          sweetSpot: null,
        };
        remainingByPlayer.set(key, entry);
      }
      // Update to highest projection seen
      if (pProj > entry.projectedPoints) entry.projectedPoints = pProj;

      entry.leagues.push({
        leagueName,
        leagueId,
        role: "your-starter",
        breakEvenPoints: breakEven,
        winningWithout,
        description: desc,
      });
    }

    // Opponent's remaining starters
    if (matchup.opponent) {
      for (const player of matchup.opponent.players) {
        if (!isRemaining(player)) continue;
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
            leagues: [],
            hasConflict: false,
            sweetSpot: null,
          };
          remainingByPlayer.set(key, entry);
        }
        if (pProj > entry.projectedPoints) entry.projectedPoints = pProj;

        entry.leagues.push({
          leagueName,
          leagueId,
          role: "opp-starter",
          breakEvenPoints: maxAllowed,
          winningWithout,
          description: desc,
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

      // Sweet spot: [max of all your minimums, min of all opp maximums]
      const minNeeded = Math.max(
        0,
        ...yourLeagues.map((l) => l.breakEvenPoints ?? 0),
      );
      const maxAllowed = Math.min(
        entry.projectedPoints * 2, // generous upper cap
        ...oppLeagues.map((l) => l.breakEvenPoints ?? entry.projectedPoints * 2),
      );

      entry.sweetSpot =
        minNeeded <= maxAllowed ? { min: minNeeded, max: maxAllowed } : null;
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

  const activeMatchups = winProbabilities.filter((w) => !w.isBye);
  const expectedWins = winProbabilities.reduce(
    (sum, w) => sum + w.winProbability,
    0,
  );
  const probAllWins =
    activeMatchups.length === 0
      ? 1
      : activeMatchups.reduce((prod, w) => prod * w.winProbability, 1);

  return {
    winProbabilities,
    playerImpacts,
    remainingPlayers,
    expectedWins,
    probAllWins,
    totalMatchups: activeMatchups.length,
  };
}
