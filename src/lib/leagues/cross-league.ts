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
 * A starter — whether still to play or already resolved this week — who
 * appears in conflicting roles across leagues (your starter in one, an
 * opponent's starter in another). Resolved players stay in the conflict
 * view after their game ends (with a fixed, no-longer-actionable per-league
 * breakdown) rather than disappearing the moment their status flips, since
 * their conflict with a still-live league is exactly as real as it was
 * before kickoff.
 */
export interface RemainingPlayerAnalysis {
  playerId: string;
  name: string;
  position: string | null;
  proTeam: string | null;
  projectedPoints: number;
  /** Their current (live) score, if any context has reported one. */
  currentPoints: number;
  /**
   * The real player's own game status — "pre" (hasn't kicked off), "in"
   * (live), or "post" (final) — same everywhere they're rostered, since
   * it's a fact about their actual game, not about any specific league.
   * Lets the UI filter the whole remaining-players list by this
   * independently of the my/opponents/mix role split.
   */
  status: GameStatus;
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
    /**
     * How many OTHER starters (either side) are still to play in this league besides this
     * player — 0 exactly when isExact is true. Continuous rather than a boolean so a visual
     * can sharpen gradually as the week's games finish, instead of jumping straight from
     * "estimate" to "final" the instant the very last one kicks off.
     */
    remainingOthers: number;
    /**
     * The combined uncertainty (one standard deviation, in points) of every
     * OTHER still-unresolved starter in this league besides this player —
     * same weekly-variance figure the Monte Carlo simulation elsewhere in
     * this file uses (projectedPoints × 0.45 per player, combined in
     * quadrature across all of them). Unlike remainingOthers (a plain
     * headcount), this actually distinguishes a league where the other
     * starter left is a boom/bust WR1 from one where it's a low-ceiling
     * kicker — meant to size how wide a "this threshold could still move"
     * visual should be, not just whether one is shown at all.
     */
    remainingSd: number;
    /**
     * True only once THIS LEAGUE's matchup has nothing left uncertain —
     * this player's own game AND every other starter on either roster have
     * all finished. This player finishing their own game is not enough:
     * their opponent's other starters (or their own teammates) can still be
     * live and swing the league after this player's score is already
     * locked in, so breakEvenPoints only becomes retrospective ("what they
     * needed") rather than actionable once nothing else in the league can
     * move it anymore.
     */
    resolved: boolean;
    /** Only meaningful when resolved (the whole league, not just this player, is decided): whether they actually cleared breakEvenPoints. null while anything in the league is still pending. */
    resolvedWin: boolean | null;
  }[];
  /**
   * True when the player is your starter in some leagues but opponent's
   * starter in others — their score is a genuine trade-off.
   */
  hasConflict: boolean;
  /**
   * "mine" — your starter everywhere they're rostered, no conflict.
   * "opponents" — an opponent's starter everywhere, no conflict.
   * "mix" — both, i.e. hasConflict. Lets the UI offer a My/Opponents/Mix
   * filter over every remaining starter, not just the ones in conflict.
   */
  category: "mine" | "opponents" | "mix";
  /**
   * When hasConflict is true: the range of points that satisfies the most
   * leagues simultaneously. null if no feasible sweet spot exists, or if
   * there's no conflict to have a sweet spot about (more points always
   * helps — or always hurts — uniformly with only one role in play).
   */
  sweetSpot: { min: number; max: number } | null;
  /** True only when every league behind the sweet spot has this player as its last remaining starter. */
  sweetSpotIsExact: boolean;
  /**
   * The full breakdown: every score band this player's final tally could
   * land in, and the resulting win-loss record across every league they
   * affect (e.g. "2-0", "1-1", "0-2"). Computed for every player, not just
   * conflicted ones — a "mine"-only or "opponents"-only player still has a
   * real per-league win/loss chart, just no cross-role trade-off.
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
 * A hand-set gameStatus (the demo editor's explicit override) always wins
 * over the real NFL schedule lookup — it exists specifically so a demo
 * scenario can be constructed directly ("has points but still in progress",
 * "zero points but done playing") rather than only inferred from team
 * abbreviation. Real platforms never set p.gameStatus, so this is a no-op
 * for them.
 */
function resolveGameStatus(
  p: LeagueTeamPlayer,
  statusByTeam?: Map<string, GameStatus>,
): GameStatus | undefined {
  return p.gameStatus ?? statusByTeam?.get(normalizeTeamAbbrev(p.proTeam));
}

/**
 * A definite pre/in/post for display/filtering, even when nothing gave us
 * one directly (the zero-points proxy has no concept of "in progress" —
 * it's only ever "hasn't started" or "done" from its perspective).
 */
function derivedPlayerStatus(
  p: LeagueTeamPlayer,
  resolved: boolean,
  statusByTeam?: Map<string, GameStatus>,
): GameStatus {
  return resolveGameStatus(p, statusByTeam) ?? (resolved ? "post" : "pre");
}

/**
 * Whether a starter's final score isn't locked in yet. Zero fantasy points
 * looks identical whether a player hasn't played or has already played and
 * scored nothing, so when a game-status is available (explicit override or
 * real NFL schedule), prefer it: "post" (game over) means their score is
 * final even if it's 0; "pre" or "in" means it isn't, even if their live
 * points somehow read nonzero (stat corrections). Falls back to the old
 * zero-points proxy when no status is available at all (e.g. a demo player
 * with no override, or a schedule lookup miss).
 */
export function isRemaining(p: LeagueTeamPlayer, statusByTeam?: Map<string, GameStatus>): boolean {
  if (!p.isStarter) return false;
  const status = resolveGameStatus(p, statusByTeam);
  if (status === "post") return false;
  // "pre"/"in" is a definitive answer on its own — the game hasn't
  // finished, so the player's score isn't locked in yet, regardless of
  // whether the platform happened to supply a nonzero projection for
  // them. Gating on projectedPoints here would silently drop a genuinely
  // remaining starter whenever a league's projection data is missing or
  // zero (a data-availability quirk, not a real "already resolved" state).
  if (status === "pre" || status === "in") return true;
  // No status at all — team is on a bye, the lookup missed, or (for demo)
  // no override was set. Fall through to the proxy, which has no
  // definitive status to lean on.
  return (p.points ?? 0) === 0 && (p.projectedPoints ?? 0) > 0;
}

/**
 * What a still-uncertain player adds on TOP of matchup.teamScore/
 * opponentScore to reach their expected final total. teamScore is a
 * straight sum of every starter's current actual points, so it already
 * includes this player's points whenever they're mid-game ("in") rather
 * than not-yet-started ("pre") — adding their FULL projection on top of
 * that would double-count whatever they've already scored. For a "pre"
 * player points is 0 anyway, so this is identical to their full projection
 * there; it only changes anything once a player can be "remaining" with
 * nonzero points, which the gameStatus override (demo editor) allows for
 * the first time.
 */
function remainingContribution(p: LeagueTeamPlayer): number {
  return (p.projectedPoints ?? 0) - (p.points ?? 0);
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
 *
 * A resolved league (this player's game already over) is included exactly
 * like a pending one, not folded into a fixed constant — its breakEvenPoints
 * is still a real question, just a retrospective one ("would this have been
 * a win if they'd scored more"), and the whole point of drawing its
 * threshold on the chart is to let that counterfactual actually flip the
 * color on either side of it. Baking in the ACTUAL result as a constant
 * instead would draw a marker that visually implied a split which never
 * happens — the line staying one flat color straight through it.
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
  // The loop below only ever tests points AT OR ABOVE points[0] — fine when
  // 0 (the seeded floor) happens to be the smallest threshold, since a
  // normal player's score can't go below that anyway, but silently wrong
  // the moment a real threshold is negative (a defense's -4, say): that
  // threshold becomes points[0], and whatever the record is for scores
  // BELOW it — a real, different outcome — never gets computed at all, so
  // the line renders as one uniform color with no threshold effect visible.
  // -Infinity here always clamps correctly wherever the domain's own min
  // ends up (see pct() at the call site), and merges away into the next
  // band below when it turns out to share the same record (the ordinary
  // positive-threshold case).
  const leadingTestScore = points[0] - Math.max(1, Math.abs(points[0]) * 0.1);
  raw.push({ min: -Infinity, max: points[0], ...outcomeAt(leadingTestScore) });
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

/** Box-Muller standard normal sample, drawn from the given uniform RNG. */
function gaussianRandom(rng: () => number): number {
  const u1 = rng() || Number.EPSILON;
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** FNV-1a — cheap, deterministic string hash used to seed the simulation below. */
function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG from a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIM_TRIALS = 10000;
const VARIANCE_COEFF = 0.45; // same rough single-player weekly-variance figure as remainingVariance
const FLOOR_SD = 3; // same residual-uncertainty floor as computeMatchupWinProb

interface SimLeague {
  lockedMine: number;
  lockedOpp: number;
  remainingMineKeys: string[];
  remainingOppKeys: string[];
  /** Demo leagues are hand-typed fake data — there's no real game that could
   * later get a stat correction, so the FLOOR_SD residual-uncertainty noise
   * below doesn't apply to them the way it does to a real platform. */
  isDemo: boolean;
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
 *
 * The RNG is seeded from the matchup data itself (scores + remaining
 * players' projections), not the system clock, so the distribution is a
 * pure function of the current state — identical on every refresh until
 * something real changes (a score updates, a player's projection moves),
 * rather than jittering randomly on every page load.
 */
function simulateJointOutcomes(
  matchupResults: { leagueId: string; platform: string; matchup: LeagueMatchup | null }[],
  statusByTeam?: Map<string, GameStatus>,
): { winCountDistribution: number[]; expectedWins: number; probAllWins: number } {
  const leagues: SimLeague[] = [];
  const players = new Map<string, { mean: number; sd: number }>();
  const seedParts: string[] = [];

  function registerPlayer(p: LeagueTeamPlayer): string {
    const key = normalizePlayerKey(p.name, p.position);
    // Mean is what's left to add on top of matchup.teamScore (which already
    // has this player's current points baked in) — not their full
    // projection, which would double-count whatever they've already
    // scored while "in progress". sd stays keyed off the full projection
    // (never negative, unlike remainingContribution once someone's already
    // exceeded their projection) so variance doesn't collapse or invert.
    const mean = remainingContribution(p);
    const sd = (p.projectedPoints ?? 0) * VARIANCE_COEFF;
    const existing = players.get(key);
    if (!existing || mean > existing.mean) {
      players.set(key, { mean, sd });
    }
    return key;
  }

  for (const { leagueId, platform, matchup } of matchupResults) {
    if (!matchup || !matchup.opponent) continue;
    // Demo leagues are hand-edited fake data — a real NFL team's live game
    // status shouldn't override the score the user actually typed in.
    const status = platform === "demo" ? undefined : statusByTeam;
    const remainingMineKeys = matchup.team.players
      .filter((p) => isRemaining(p, status))
      .map(registerPlayer);
    const remainingOppKeys = matchup.opponent.players
      .filter((p) => isRemaining(p, status))
      .map(registerPlayer);
    leagues.push({
      lockedMine: matchup.teamScore ?? 0,
      lockedOpp: matchup.opponentScore ?? 0,
      remainingMineKeys,
      remainingOppKeys,
      isDemo: platform === "demo",
    });
    seedParts.push(
      `${leagueId}:${matchup.teamScore}:${matchup.opponentScore}:${[...remainingMineKeys].sort().join(",")}:${[...remainingOppKeys].sort().join(",")}`,
    );
  }

  if (leagues.length === 0) {
    return { winCountDistribution: [1], expectedWins: 0, probAllWins: 1 };
  }

  const playerEntries = [...players.entries()];
  seedParts.push(
    ...playerEntries
      .map(([key, { mean }]) => `${key}=${mean}`)
      .sort(),
  );
  const rng = mulberry32(hashSeed(seedParts.sort().join("|")));

  const winCounts = new Array(leagues.length + 1).fill(0);
  let totalWins = 0;
  let sweepCount = 0;

  for (let trial = 0; trial < SIM_TRIALS; trial++) {
    const draws = new Map<string, number>();
    for (const [key, { mean, sd }] of playerEntries) {
      draws.set(key, Math.max(0, mean + gaussianRandom(rng) * sd));
    }

    let wins = 0;
    for (const league of leagues) {
      const mineExtra = league.remainingMineKeys.reduce((s, k) => s + (draws.get(k) ?? 0), 0);
      const oppExtra = league.remainingOppKeys.reduce((s, k) => s + (draws.get(k) ?? 0), 0);
      // A demo league's data is entirely hand-typed — there's no real game
      // behind it that could later receive a stat correction, so even a
      // fully-resolved (no remaining players) demo league should collapse
      // to a clean, deterministic 100%/0% outcome instead of getting this
      // noise term smeared across it.
      const floorNoise = league.isDemo ? 0 : FLOOR_SD;
      const finalMine = league.lockedMine + mineExtra + gaussianRandom(rng) * floorNoise;
      const finalOpp = league.lockedOpp + oppExtra + gaussianRandom(rng) * floorNoise;
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
  // Combined variance (not yet standard deviation — squared, so it can be
  // summed before a single sqrt at the end) of EVERY remaining starter in
  // each league, both sides. Per-player breakEven entries below subtract
  // out their own contribution to get "every OTHER remaining starter's"
  // figure specifically.
  const remainingVarianceByLeague = new Map<string, number>();
  function playerVariance(p: LeagueTeamPlayer): number {
    const sd = (p.projectedPoints ?? 0) * VARIANCE_COEFF;
    return sd * sd;
  }

  for (const { leagueId, platform, matchup } of matchupResults) {
    if (!matchup || !matchup.opponent) continue;
    const status = platform === "demo" ? undefined : statusByTeam;
    const myRemaining = matchup.team.players.filter((p) => isRemaining(p, status));
    const oppRemaining = matchup.opponent.players.filter((p) => isRemaining(p, status));
    remainingCountByLeague.set(leagueId, myRemaining.length + oppRemaining.length);
    remainingVarianceByLeague.set(
      leagueId,
      [...myRemaining, ...oppRemaining].reduce((sum, p) => sum + playerVariance(p), 0),
    );
    // Computed from currentScore + each remaining starter's own remaining
    // contribution (not the platform's aggregate teamProjectedScore/
    // opponentProjectedScore) so that subtracting a specific remaining
    // player's contribution below — to get "final score without them" — is
    // subtracting something that was actually included in the total. Demo
    // leagues set their aggregate projected score equal to the current
    // actual score (see demo.ts), which never includes remaining players at
    // all; trusting that field here would silently double-discount the
    // target player's own projection.
    leagueProjData.set(leagueId, {
      myProj: (matchup.teamScore ?? 0) + myRemaining.reduce((s, p) => s + remainingContribution(p), 0),
      oppProj:
        (matchup.opponentScore ?? 0) + oppRemaining.reduce((s, p) => s + remainingContribution(p), 0),
    });
  }

  // Collect all remaining starters that appear in a meaningful role
  const remainingByPlayer = new Map<string, RemainingPlayerAnalysis>();
  // A real player's actual points can differ across leagues (PPR vs.
  // standard, different bonus rules) — currentPoints (used to place the
  // dot on the chart) is the average across every league they appear in,
  // not whichever single league's number happened to be seen last/highest.
  const currentPointsSum = new Map<string, { sum: number; count: number }>();
  function trackCurrentPoints(key: string, points: number) {
    const stats = currentPointsSum.get(key) ?? { sum: 0, count: 0 };
    stats.sum += points;
    stats.count += 1;
    currentPointsSum.set(key, stats);
  }

  for (const { leagueId, leagueName, platform, matchup } of matchupResults) {
    if (!matchup || !matchup.opponent) continue;
    const proj = leagueProjData.get(leagueId);
    if (!proj) continue;
    const status = platform === "demo" ? undefined : statusByTeam;

    // My starters — every starter, not just ones still to play. A player
    // who's already locked in on one side but still pending (or also
    // locked in, just for the other team) on another is exactly as much of
    // a genuine conflict as a fully-pending one; excluding resolved
    // players here used to silently drop them from the whole conflict view
    // the moment their game ended, even though the OTHER league(s) they
    // conflict with may still be live.
    for (const player of matchup.team.players) {
      if (!player.isStarter) continue;
      // This player's OWN game only — not whether this league is decided.
      // Other starters on either roster can easily still be live after this
      // one finishes, so this alone must never drive resolvedWin, isExact,
      // or hiding this league's threshold; see leagueResolved below for that.
      const playerResolved = !isRemaining(player, status);
      const derivedStatus = derivedPlayerStatus(player, playerResolved, status);
      // The TOTAL figure — their locked actual score once resolved, their
      // full projected total while pending. Always the FULL total, not just
      // what's still left to add: breakEven below is itself a total-points
      // threshold (the same axis the current-points dot is plotted on), and
      // subtracting anything less than the full total here would leave part
      // of this player's own contribution still baked into "myWithout" —
      // which would then drift as their live score changes, moving the
      // threshold along with them instead of holding it fixed while their
      // dot moves toward it.
      const pContribution = playerResolved ? player.points ?? 0 : player.projectedPoints ?? 0;
      // Same real-player identity as the rest of the app (roster-overlap.ts,
      // outcome-landscape.ts) — not playerKey's platform+raw-id scheme, which
      // deliberately keeps platforms separate and (for demo leagues, whose
      // ids are hand-typed per roster) can't be trusted to be consistent for
      // the same player across leagues anyway. Using it here would silently
      // strand a newly-added team's copy of this player in its own entry
      // instead of joining the existing conflict.
      const key = normalizePlayerKey(player.name, player.position);

      // My projected (or, if resolved, actual) final without this player
      const myWithout = proj.myProj - pContribution;
      // To win: myWithout + p's score > proj.oppProj
      const breakEven = proj.oppProj - myWithout; // needed >= this to win
      const winningWithout = myWithout > proj.oppProj;

      // Every OTHER remaining starter (either side) in this league besides
      // this one. remainingCountByLeague/remainingVarianceByLeague are built
      // from isRemaining, so they already EXCLUDE this player the moment
      // their own game ends — subtracting this player's own count/variance
      // out is only correct, and only needed, while they're still pending
      // (still counted in those totals themselves).
      const othersRemaining = playerResolved
        ? remainingCountByLeague.get(leagueId) ?? 0
        : Math.max(0, (remainingCountByLeague.get(leagueId) ?? 1) - 1);
      const othersVariance = playerResolved
        ? remainingVarianceByLeague.get(leagueId) ?? 0
        : Math.max(0, (remainingVarianceByLeague.get(leagueId) ?? 0) - playerVariance(player));
      // The whole league is only actually decided once BOTH this player's
      // own game is over AND nothing else left in the league can still move
      // the result — not the moment this one player finishes.
      const leagueResolved = playerResolved && othersRemaining === 0;

      const desc = leagueResolved
        ? winningWithout
          ? `Won this league even without ${player.name}'s ${pContribution.toFixed(1)} pts`
          : `Scored ${pContribution.toFixed(1)} pts — ${
              pContribution >= breakEven ? "enough to" : "not enough to"
            } secure the win`
        : playerResolved
        ? pContribution >= breakEven
          ? `Scored ${pContribution.toFixed(1)} pts, cleared the ${breakEven.toFixed(1)} they needed — still waiting on ${othersRemaining} other starter${othersRemaining === 1 ? "" : "s"}`
          : `Scored ${pContribution.toFixed(1)} pts, short of the ${breakEven.toFixed(1)} they needed — still waiting on ${othersRemaining} other starter${othersRemaining === 1 ? "" : "s"}`
        : winningWithout
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
          projectedPoints: pContribution,
          currentPoints: player.points ?? 0,
          status: derivedStatus,
          leagues: [],
          hasConflict: false,
          // Placeholder — finalized once every league for this player has
          // been collected, in the "Detect conflicts" pass below.
          category: "mine",
          sweetSpot: null,
          sweetSpotIsExact: false,
          recordBands: [],
        };
        remainingByPlayer.set(key, entry);
      }
      // Update to highest projection seen; currentPoints is finalized as an
      // average below, once every league's appearance has been tracked.
      if (pContribution > entry.projectedPoints) entry.projectedPoints = pContribution;
      trackCurrentPoints(key, player.points ?? 0);
      entry.status = derivedStatus;

      entry.leagues.push({
        leagueName,
        leagueId,
        role: "your-starter",
        breakEvenPoints: breakEven,
        winningWithout,
        description: desc,
        isExact: othersRemaining === 0,
        remainingOthers: othersRemaining,
        remainingSd: Math.sqrt(othersVariance),
        resolved: leagueResolved,
        resolvedWin: leagueResolved ? pContribution >= breakEven : null,
      });
    }

    // Opponent's starters — see the comment above the "My starters" loop.
    if (matchup.opponent) {
      for (const player of matchup.opponent.players) {
        if (!player.isStarter) continue;
        // This player's OWN game only — see the matching comment above the
        // "My starters" loop for why this must not drive resolvedWin/
        // isExact/the threshold display on its own.
        const playerResolved = !isRemaining(player, status);
        const derivedStatus = derivedPlayerStatus(player, playerResolved, status);
        // See the matching comments above the "My starters" loop.
        const pContribution = playerResolved ? player.points ?? 0 : player.projectedPoints ?? 0;
        // See the matching comment above — same real-player identity as the
        // rest of the app, not the platform+raw-id scheme.
        const key = normalizePlayerKey(player.name, player.position);

        // Opp projected (or, if resolved, actual) final without this player
        const oppWithout = proj.oppProj - pContribution;
        // I win if: proj.myProj > oppWithout + p's score
        // i.e. p's score < proj.myProj - oppWithout
        const maxAllowed = proj.myProj - oppWithout;
        const winningWithout = proj.myProj > oppWithout;

        // See the matching comment above the "My starters" loop.
        const othersRemaining = playerResolved
          ? remainingCountByLeague.get(leagueId) ?? 0
          : Math.max(0, (remainingCountByLeague.get(leagueId) ?? 1) - 1);
        const othersVariance = playerResolved
          ? remainingVarianceByLeague.get(leagueId) ?? 0
          : Math.max(0, (remainingVarianceByLeague.get(leagueId) ?? 0) - playerVariance(player));
        const leagueResolved = playerResolved && othersRemaining === 0;

        const desc = leagueResolved
          ? winningWithout
            ? `Won this league even though ${player.name} scored ${pContribution.toFixed(1)} pts`
            : `${player.name} scored ${pContribution.toFixed(1)} pts — ${
                pContribution <= maxAllowed ? "still" : "not"
              } enough for you to win`
          : playerResolved
          ? pContribution <= maxAllowed
            ? `${player.name} scored ${pContribution.toFixed(1)} pts, within the ${maxAllowed.toFixed(1)} limit so far — waiting on ${othersRemaining} other starter${othersRemaining === 1 ? "" : "s"}`
            : `${player.name} scored ${pContribution.toFixed(1)} pts, over the ${maxAllowed.toFixed(1)} limit — waiting on ${othersRemaining} other starter${othersRemaining === 1 ? "" : "s"}`
          : winningWithout
          ? `Winning even if ${player.name} scores their projection (${pContribution.toFixed(1)} pts)`
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
            projectedPoints: pContribution,
            currentPoints: player.points ?? 0,
            status: derivedStatus,
            leagues: [],
            hasConflict: false,
            // Placeholder — finalized once every league for this player
            // has been collected, in the "Detect conflicts" pass below.
            category: "mine",
            sweetSpot: null,
            sweetSpotIsExact: false,
            recordBands: [],
          };
          remainingByPlayer.set(key, entry);
        }
        if (pContribution > entry.projectedPoints) entry.projectedPoints = pContribution;
        trackCurrentPoints(key, player.points ?? 0);
        entry.status = derivedStatus;

        entry.leagues.push({
          leagueName,
          leagueId,
          role: "opp-starter",
          breakEvenPoints: maxAllowed,
          winningWithout,
          description: desc,
          isExact: othersRemaining === 0,
          remainingOthers: othersRemaining,
          remainingSd: Math.sqrt(othersVariance),
          resolved: leagueResolved,
          resolvedWin: leagueResolved ? pContribution <= maxAllowed : null,
        });
      }
    }
  }

  // Detect conflicts, categorize, and compute sweet spots + record bands —
  // for EVERY remaining player, not just conflicted ones, so a "mine"-only
  // or "opponents"-only player still gets a real per-league win/loss chart
  // (just no cross-role trade-off, hence no sweet spot).
  for (const entry of remainingByPlayer.values()) {
    const yourLeagues = entry.leagues.filter((l) => l.role === "your-starter");
    const oppLeagues = entry.leagues.filter((l) => l.role === "opp-starter");

    entry.hasConflict = yourLeagues.length > 0 && oppLeagues.length > 0;
    entry.category = entry.hasConflict ? "mix" : yourLeagues.length > 0 ? "mine" : "opponents";

    const cpStats = currentPointsSum.get(entry.playerId);
    entry.currentPoints = cpStats ? cpStats.sum / cpStats.count : 0;

    if (entry.hasConflict) {
      // Sweet spot is actionable guidance ("what should this player do from
      // here"), so it's built only from leagues still actually pending —
      // a resolved league has nothing left to root for, and folding its
      // fixed breakEvenPoints into the min/max here would distort the range
      // with a threshold that can no longer be influenced.
      const pendingYourLeagues = yourLeagues.filter((l) => !l.resolved);
      const pendingOppLeagues = oppLeagues.filter((l) => !l.resolved);

      if (pendingYourLeagues.length === 0 && pendingOppLeagues.length === 0) {
        // Everything relevant to this player already happened.
        entry.sweetSpot = null;
        entry.sweetSpotIsExact = false;
      } else {
        // Not floored at 0 — a genuinely negative threshold ("you're covered
        // even if they bomb") is real information, not noise.
        const minNeeded =
          pendingYourLeagues.length > 0
            ? Math.max(...pendingYourLeagues.map((l) => l.breakEvenPoints ?? 0))
            : 0;
        // Generous upper cap either way — also stands in for "no ceiling"
        // when every opp-side league here is already resolved, since
        // sweetSpot.max isn't nullable.
        const maxAllowed = Math.min(
          entry.projectedPoints * 2,
          ...pendingOppLeagues.map((l) => l.breakEvenPoints ?? entry.projectedPoints * 2),
        );

        entry.sweetSpot = minNeeded <= maxAllowed ? { min: minNeeded, max: maxAllowed } : null;
        entry.sweetSpotIsExact =
          pendingYourLeagues.every((l) => l.isExact) && pendingOppLeagues.every((l) => l.isExact);
      }
    }
    // Unconditional — a player with only one role still has a real
    // win/loss record as their score crosses each league's threshold, it
    // just never mixes wins and losses at the same time the way a conflict
    // does.
    entry.recordBands = computeRecordBands(yourLeagues, oppLeagues);
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
