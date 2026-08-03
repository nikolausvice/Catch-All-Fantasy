import { normalizePlayerKey } from "./roster-overlap";
import { normalizeTeamAbbrev, type GameStatus } from "./nfl-schedule";
import type { LeagueMatchup, LeagueTeamPlayer } from "./types";

// ---------------------------------------------------------------------------
// "Outcome Landscape" — an independent analytics engine answering a
// different question than cross-league.ts's rooting score: not "how likely
// am I to win right now", but "what performance from each remaining player
// produces the best overall portfolio outcome across every connected
// league". Deliberately self-contained (own copies of the small helpers it
// needs) rather than importing cross-league.ts internals, so the two
// systems can evolve independently.
//
// Core idea: every player's performance is represented on one canonical,
// provider-independent axis — a ratio of their own projection (1.0 = hits
// projection, 0 = scores nothing, 2.0 = doubles it). That single ratio is
// then converted into actual fantasy points separately for each league via
// *that league's own* projection for the player, so a PPR league and a
// standard league looking at the same underlying performance each see the
// correctly-scaled point total. Uncertainty from other not-yet-finished
// players is modeled with Monte Carlo sampling in the same ratio space; as
// real games finish, those other players drop out of the simulation
// entirely (their score is locked), so the landscape sharpens on its own —
// with zero other players left, the simulation collapses to a single
// deterministic trial, producing exact thresholds instead of blurred ones.
// ---------------------------------------------------------------------------

// ── Public types ────────────────────────────────────────────────────────────

/** Which side of a matchup this player is on, for a specific league. */
export type PlayerRole = "mine" | "opponent";

export interface LeaguePerformanceMapping {
  leagueId: string;
  leagueName: string;
  role: PlayerRole;
  /** This league's own projection for the player — may differ across leagues (different provider/scoring settings). */
  projectedPoints: number;
}

/** One point sampled along the continuous performance axis. */
export interface PerformanceSample {
  /** Performance as a multiple of projection (0 = scoreless, 1.0 = hit projection, 2.0 = doubled it). */
  r: number;
  /** Most likely overall win count across the portfolio at this performance level. */
  mode: number;
  /** Probability (0–1) that the win count actually lands on `mode` at this performance level. */
  modeProbability: number;
}

export interface OutcomeRegion {
  /** Inclusive lower bound, in normalized performance-ratio units. */
  min: number;
  /** Exclusive upper bound; null = open-ended top of the axis. */
  max: number | null;
  wins: number;
  losses: number;
  /** e.g. "Lose All", "3-3", "Win All". */
  label: string;
  /** How dominant this outcome is within its own range (avg probability across samples in the region). */
  probability: number;
}

export interface OutcomeBoundary {
  /** Normalized performance value where the dominant record flips. */
  at: number;
  fromLabel: string;
  toLabel: string;
  /**
   * 0–1. How sharp this transition is. 1 = a clean, deterministic
   * threshold (e.g. no other unresolved players anywhere in the
   * portfolio to blur it); values near 0 mean other still-unfinished
   * players could plausibly swing the record on either side of this
   * point. Intended for the frontend to map directly onto rendering: low
   * certainty → soft/blurred boundary line, high certainty → sharp line.
   */
  certainty: number;
}

export interface OptimalRangeSpan {
  min: number;
  max: number | null;
  /** Same span translated into actual fantasy points for every league this player affects. */
  perLeague: { leagueId: string; leagueName: string; min: number; max: number | null }[];
}

export type OptimizationGoal =
  | { type: "maximize-wins" }
  | { type: "avoid-lose-all" }
  | { type: "at-least-wins"; wins: number };

export interface OptimalRange {
  goal: OptimizationGoal;
  /** Human-readable description of what the range achieves, e.g. "Win All" or ">= 4 wins". */
  achieves: string;
  /** Disjoint spans of the axis that satisfy the goal — usually one, but a player who's a conflicting starter/opponent across leagues can produce more than one. */
  spans: OptimalRangeSpan[];
}

export interface PlayerOutcomeLandscape {
  playerId: string;
  name: string;
  position: string | null;
  proTeam: string | null;
  leagues: LeaguePerformanceMapping[];
  axisRange: { min: number; max: number };
  /** Sparse dense sampling of the continuous axis, for frontends that want a smooth curve rather than just discrete regions. */
  samples: PerformanceSample[];
  regions: OutcomeRegion[];
  boundaries: OutcomeBoundary[];
  /**
   * 0–1. How "locked in" this player's outcome landscape already is.
   * Driven entirely by how many other players across the portfolio are
   * still unresolved — 1.0 when this is the only remaining player left
   * anywhere (exact thresholds), lower the more other variance is still
   * in play.
   */
  confidence: number;
  optimalRange: OptimalRange | null;
}

export interface OutcomeLandscape {
  players: PlayerOutcomeLandscape[];
  totalMatchups: number;
  optimizationGoal: OptimizationGoal;
}

export interface OutcomeLandscapeOptions {
  optimizationGoal?: OptimizationGoal;
  /** Max performance ratio simulated (default 3.0 = 300% of projection). */
  axisMax?: number;
  /** Number of points sampled along the base grid (default 25). */
  axisSamples?: number;
  /** Trials per sample point when other players are still unresolved (default 500). */
  baseTrials?: number;
  /** Trials per bisection step when refining a boundary's exact location (default 1500). */
  refineTrials?: number;
  /** Bisection steps used to narrow a boundary (default 6). */
  refineSteps?: number;
}

// ── Internal helpers (self-contained — not shared with cross-league.ts) ────

/** Same rough single-player weekly-variance figure used elsewhere in this app's projections. */
const VARIANCE_COEFF = 0.45;

const DEFAULTS = {
  axisMax: 3,
  axisSamples: 25,
  baseTrials: 500,
  refineTrials: 1500,
  refineSteps: 6,
} satisfies Required<Omit<OutcomeLandscapeOptions, "optimizationGoal">>;

function isNotYetStarted(p: LeagueTeamPlayer, statusByTeam?: Map<string, GameStatus>): boolean {
  if (!p.isStarter) return false;
  if (statusByTeam) {
    const status = statusByTeam.get(normalizeTeamAbbrev(p.proTeam));
    if (status === "post" || status === "in") return false;
    if (status === "pre") return (p.projectedPoints ?? 0) > 0;
    // No schedule entry (bye, or lookup miss) — fall through to the proxy below.
  }
  return (p.points ?? 0) === 0 && (p.projectedPoints ?? 0) > 0;
}

/** Box-Muller standard normal sample. */
function gaussianRandom(): number {
  const u1 = Math.random() || Number.EPSILON;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function recordLabel(wins: number, total: number): string {
  if (wins === 0) return "Lose All";
  if (wins === total) return "Win All";
  return `${wins}-${total - wins}`;
}

function modeAndProb(counts: number[]): { mode: number; prob: number } {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  let mode = 0;
  let best = -1;
  counts.forEach((c, k) => {
    if (c > best) {
      best = c;
      mode = k;
    }
  });
  return { mode, prob: best / total };
}

interface RemainingPlayerEntry {
  key: string;
  name: string;
  position: string | null;
  proTeam: string | null;
  appearances: { leagueId: string; leagueName: string; role: PlayerRole; projectedPoints: number }[];
}

function registerAppearance(
  map: Map<string, RemainingPlayerEntry>,
  p: LeagueTeamPlayer,
  leagueId: string,
  leagueName: string,
  role: PlayerRole,
) {
  const key = normalizePlayerKey(p.name, p.position);
  let entry = map.get(key);
  if (!entry) {
    entry = { key, name: p.name, position: p.position, proTeam: p.proTeam, appearances: [] };
    map.set(key, entry);
  }
  entry.appearances.push({ leagueId, leagueName, role, projectedPoints: p.projectedPoints ?? 0 });
}

interface SimLeague {
  leagueId: string;
  leagueName: string;
  lockedMine: number;
  lockedOpp: number;
  otherMineKeys: string[];
  otherOppKeys: string[];
}

/**
 * Draws one normalized performance ratio per still-unresolved "other"
 * player (shared across every league they appear in, so a player who's
 * your starter in one league and an opponent's starter in another gets a
 * single, correlated outcome rather than independent ones), then resolves
 * every active league's win/loss using the target player's ratio `r` fixed
 * at the given point plus those draws — each converted to actual points
 * via that specific league's own projection for that player.
 */
function simulateAtR(
  r: number,
  simLeagues: SimLeague[],
  targetAppearanceByLeague: Map<string, { role: PlayerRole; projectedPoints: number }>,
  otherAppearancesByPlayerLeague: Map<string, Map<string, { role: PlayerRole; projectedPoints: number }>>,
  trials: number,
): number[] {
  const winCounts = new Array(simLeagues.length + 1).fill(0);
  const otherKeys = [...otherAppearancesByPlayerLeague.keys()];

  for (let t = 0; t < trials; t++) {
    const draws = new Map<string, number>();
    for (const key of otherKeys) {
      draws.set(key, Math.max(0, 1 + gaussianRandom() * VARIANCE_COEFF));
    }

    let wins = 0;
    for (const league of simLeagues) {
      let mine = league.lockedMine;
      let opp = league.lockedOpp;

      const targetApp = targetAppearanceByLeague.get(league.leagueId);
      if (targetApp) {
        const pts = r * targetApp.projectedPoints;
        if (targetApp.role === "mine") mine += pts;
        else opp += pts;
      }

      for (const key of league.otherMineKeys) {
        const info = otherAppearancesByPlayerLeague.get(key)?.get(league.leagueId);
        if (info) mine += (draws.get(key) ?? 1) * info.projectedPoints;
      }
      for (const key of league.otherOppKeys) {
        const info = otherAppearancesByPlayerLeague.get(key)?.get(league.leagueId);
        if (info) opp += (draws.get(key) ?? 1) * info.projectedPoints;
      }

      if (mine > opp) wins++;
    }

    winCounts[wins]++;
  }

  return winCounts;
}

function computeOptimalRange(
  regions: OutcomeRegion[],
  totalMatchups: number,
  goal: OptimizationGoal,
  target: RemainingPlayerEntry,
): OptimalRange {
  let qualifying: OutcomeRegion[];
  let achieves: string;

  if (goal.type === "maximize-wins") {
    const best = Math.max(...regions.map((r) => r.wins));
    qualifying = regions.filter((r) => r.wins === best);
    achieves = recordLabel(best, totalMatchups);
  } else if (goal.type === "avoid-lose-all") {
    qualifying = regions.filter((r) => r.wins > 0);
    achieves = "Avoid Lose All";
  } else {
    qualifying = regions.filter((r) => r.wins >= goal.wins);
    achieves = `>= ${goal.wins} win${goal.wins === 1 ? "" : "s"}`;
  }

  const spans: OptimalRangeSpan[] = qualifying.map((region) => ({
    min: region.min,
    max: region.max,
    perLeague: target.appearances.map((a) => ({
      leagueId: a.leagueId,
      leagueName: a.leagueName,
      min: region.min * a.projectedPoints,
      max: region.max != null ? region.max * a.projectedPoints : null,
    })),
  }));

  return { goal, achieves, spans };
}

function computePlayerLandscape(
  target: RemainingPlayerEntry,
  others: RemainingPlayerEntry[],
  activeLeagues: { leagueId: string; leagueName: string; matchup: LeagueMatchup }[],
  lockedByLeague: Map<string, { mine: number; opp: number }>,
  totalMatchups: number,
  optimizationGoal: OptimizationGoal,
  opts: typeof DEFAULTS,
): PlayerOutcomeLandscape {
  const targetAppearanceByLeague = new Map<string, { role: PlayerRole; projectedPoints: number }>();
  for (const a of target.appearances) {
    targetAppearanceByLeague.set(a.leagueId, { role: a.role, projectedPoints: a.projectedPoints });
  }

  const otherAppearancesByPlayerLeague = new Map<
    string,
    Map<string, { role: PlayerRole; projectedPoints: number }>
  >();
  for (const o of others) {
    const byLeague = new Map<string, { role: PlayerRole; projectedPoints: number }>();
    for (const a of o.appearances) byLeague.set(a.leagueId, { role: a.role, projectedPoints: a.projectedPoints });
    otherAppearancesByPlayerLeague.set(o.key, byLeague);
  }

  const simLeagues: SimLeague[] = activeLeagues.map(({ leagueId, leagueName }) => {
    const locked = lockedByLeague.get(leagueId)!;
    const otherMineKeys = others
      .filter((o) => o.appearances.some((a) => a.leagueId === leagueId && a.role === "mine"))
      .map((o) => o.key);
    const otherOppKeys = others
      .filter((o) => o.appearances.some((a) => a.leagueId === leagueId && a.role === "opponent"))
      .map((o) => o.key);
    return { leagueId, leagueName, lockedMine: locked.mine, lockedOpp: locked.opp, otherMineKeys, otherOppKeys };
  });

  const hasOtherRemaining = others.length > 0;
  const trials = hasOtherRemaining ? opts.baseTrials : 1;
  const refineTrials = hasOtherRemaining ? opts.refineTrials : 1;

  const run = (r: number, t: number) =>
    simulateAtR(r, simLeagues, targetAppearanceByLeague, otherAppearancesByPlayerLeague, t);

  // ── Base grid: dense, cheap samples across the whole axis ────────────────
  const step = opts.axisMax / (opts.axisSamples - 1);
  const samples: PerformanceSample[] = [];
  const gridModeProb: { mode: number; prob: number }[] = [];
  for (let i = 0; i < opts.axisSamples; i++) {
    const r = i * step;
    const { mode, prob } = modeAndProb(run(r, trials));
    samples.push({ r, mode, modeProbability: prob });
    gridModeProb.push({ mode, prob });
  }

  // ── Walk the grid, turning mode changes into regions + boundaries ────────
  const regions: OutcomeRegion[] = [];
  const boundaries: OutcomeBoundary[] = [];

  let regionStart = 0;
  let regionMode = samples[0].mode;
  let regionProbs: number[] = [samples[0].modeProbability];

  for (let i = 1; i < samples.length; i++) {
    if (samples[i].mode === regionMode) {
      regionProbs.push(samples[i].modeProbability);
      continue;
    }

    // Bisect between samples[i - 1] and samples[i] to narrow the boundary.
    let lo = samples[i - 1].r;
    let hi = samples[i].r;
    const nextMode = samples[i].mode;
    for (let s = 0; s < opts.refineSteps; s++) {
      const mid = (lo + hi) / 2;
      const { mode } = modeAndProb(run(mid, refineTrials));
      if (mode === regionMode) lo = mid;
      else hi = mid;
    }
    const boundaryAt = (lo + hi) / 2;

    const loEval = modeAndProb(run(lo, refineTrials));
    const hiEval = modeAndProb(run(hi, refineTrials));
    const certainty = hasOtherRemaining ? clamp01((loEval.prob + hiEval.prob) / 2) : 1;

    regions.push({
      min: regionStart,
      max: boundaryAt,
      wins: regionMode,
      losses: totalMatchups - regionMode,
      label: recordLabel(regionMode, totalMatchups),
      probability: avg(regionProbs),
    });
    boundaries.push({
      at: boundaryAt,
      fromLabel: recordLabel(regionMode, totalMatchups),
      toLabel: recordLabel(nextMode, totalMatchups),
      certainty,
    });

    regionStart = boundaryAt;
    regionMode = nextMode;
    regionProbs = [samples[i].modeProbability];
  }

  regions.push({
    min: regionStart,
    max: null,
    wins: regionMode,
    losses: totalMatchups - regionMode,
    label: recordLabel(regionMode, totalMatchups),
    probability: avg(regionProbs),
  });

  const confidence = clamp01(avg(gridModeProb.map((g) => g.prob)));
  const optimalRange = computeOptimalRange(regions, totalMatchups, optimizationGoal, target);

  const leagues: LeaguePerformanceMapping[] = target.appearances.map((a) => ({
    leagueId: a.leagueId,
    leagueName: a.leagueName,
    role: a.role,
    projectedPoints: a.projectedPoints,
  }));

  return {
    playerId: target.key,
    name: target.name,
    position: target.position,
    proTeam: target.proTeam,
    leagues,
    axisRange: { min: 0, max: opts.axisMax },
    samples,
    regions,
    boundaries,
    confidence,
    optimalRange,
  };
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Computes the "Outcome Landscape" for every remaining (not-yet-started)
 * starter across all connected leagues: for each player, a continuous
 * normalized performance axis mapped to the resulting portfolio win/loss
 * record, with certainty-scored transition boundaries and an optimal
 * performance range for the given goal. Pure function — returns
 * UI-friendly plain data, renders nothing itself.
 */
export function computeOutcomeLandscape(
  matchupResults: {
    leagueId: string;
    leagueName: string;
    platform: string;
    matchup: LeagueMatchup | null;
  }[],
  statusByTeam?: Map<string, GameStatus>,
  options: OutcomeLandscapeOptions = {},
): OutcomeLandscape {
  const optimizationGoal = options.optimizationGoal ?? { type: "maximize-wins" };
  const opts = { ...DEFAULTS, ...options };

  const activeLeagues = matchupResults
    .filter((m): m is typeof m & { matchup: LeagueMatchup } => m.matchup != null && m.matchup.opponent != null)
    .map(({ leagueId, leagueName, platform, matchup }) => ({ leagueId, leagueName, platform, matchup }));

  const lockedByLeague = new Map<string, { mine: number; opp: number }>();
  const remainingPlayers = new Map<string, RemainingPlayerEntry>();

  for (const { leagueId, leagueName, platform, matchup } of activeLeagues) {
    const status = platform === "demo" ? undefined : statusByTeam;

    lockedByLeague.set(leagueId, {
      mine: matchup.teamScore ?? 0,
      opp: matchup.opponentScore ?? 0,
    });

    for (const p of matchup.team.players) {
      if (isNotYetStarted(p, status)) registerAppearance(remainingPlayers, p, leagueId, leagueName, "mine");
    }
    for (const p of matchup.opponent!.players) {
      if (isNotYetStarted(p, status)) registerAppearance(remainingPlayers, p, leagueId, leagueName, "opponent");
    }
  }

  const totalMatchups = activeLeagues.length;
  const players: PlayerOutcomeLandscape[] = [];

  for (const [targetKey, target] of remainingPlayers) {
    const others = [...remainingPlayers.values()].filter((r) => r.key !== targetKey);
    players.push(
      computePlayerLandscape(target, others, activeLeagues, lockedByLeague, totalMatchups, optimizationGoal, opts),
    );
  }

  // Least locked-in first — the players whose remaining performance still
  // has the most power to reshape the portfolio are the most actionable to
  // surface first in a "what should I root for" view.
  players.sort((a, b) => a.confidence - b.confidence || a.name.localeCompare(b.name));

  return { players, totalMatchups, optimizationGoal };
}
