import { impliedProbability } from './odds';
import type { PlayerProps, PropLine } from './types';

/**
 * Converts a player's props into projected fantasy points, so two players can be compared on a
 * single number instead of market by market.
 *
 * This is the only way to compare across positions honestly. Market-by-market scoring silently
 * undercounts a rushing back against a receiver, because they share almost no markets - points
 * are the common currency.
 */

/** Scoring formats differ only in what a reception is worth, which is enough to reorder WR/RB. */
export type Scoring = 'ppr' | 'half' | 'standard';

export const SCORING_LABELS: Record<Scoring, string> = {
  ppr: 'PPR',
  half: 'Half PPR',
  standard: 'Standard',
};

const POINTS_PER_RECEPTION: Record<Scoring, number> = {
  ppr: 1,
  half: 0.5,
  standard: 0,
};

/** Standard fantasy scoring. These are league constants, not tunables. */
const PASS_YARDS_PER_POINT = 25;
const RUSH_REC_YARDS_PER_POINT = 10;
const POINTS_PER_PASSING_TD = 4;
const POINTS_PER_TD = 6;

/**
 * Fallback values for a market the position calls for but no book posted.
 *
 * A missing line is not missing information - books decline to post receiving lines for
 * low-usage players, so absence means low usage. Treating it as zero would overstate the gap;
 * treating it as median would erase a real signal. These are the median of the bottom quartile
 * of players who DO have the market, measured from the cached snapshot.
 */
const ABSENT_BASELINE: Record<string, Record<string, number>> = {
  WR: { receiving_yards: 27.5, receiving_receptions: 2.5 },
  TE: { receiving_yards: 11.8, receiving_receptions: 1.5 },
  RB: { receiving_yards: 7.2, receiving_receptions: 1, rushing_yards: 38 },
  FB: { receiving_yards: 7.2, receiving_receptions: 1, rushing_yards: 38 },
};

/**
 * The markets a position is normally priced on. Used to report coverage honestly: three posted
 * markets out of three is a different claim from one out of three, and the old rule - two real
 * markets makes a projection - hid that behind a single arbitrary cutoff.
 */
const EXPECTED_MARKETS: Record<string, string[]> = {
  QB: ['passing_yards', 'passing_touchdowns', 'rushing_yards', 'touchdowns'],
  RB: ['rushing_yards', 'touchdowns', 'receiving_yards', 'receiving_receptions'],
  WR: ['receiving_yards', 'receiving_receptions', 'touchdowns'],
  TE: ['receiving_yards', 'receiving_receptions', 'touchdowns'],
  FB: ['rushing_yards', 'touchdowns', 'receiving_yards', 'receiving_receptions'],
};

export interface Projection {
  /** Projected fantasy points under the selected scoring format. */
  points: number;
  /** Markets that were estimated rather than read from a posted line. */
  estimated: string[];
  /** True when every market the position calls for had a real line. */
  complete: boolean;
  /** Per-market point contributions, largest first, for explaining the total. */
  breakdown: { statId: string; market: string; points: number; estimated: boolean }[];
  /** Markets with a real posted line, out of those the position is normally priced on. */
  posted: number;
  expected: number;
}

/**
 * Markets whose posted line is a threshold rather than a projection, so their value is the
 * probability of clearing it rather than the line itself.
 */
const THRESHOLD_MARKETS = new Set(['touchdowns_2plus', 'passing_touchdowns_2plus']);

/**
 * Median book price for a market, as an implied probability.
 *
 * The 2+ markets carry no de-vigged consensus - the provider's fair number for them is wrong
 * (see the backend note on ReadTwoPlus) - so their probability has to come from the books, with
 * the vig still in it. The median across books is steadier than any single one, and because the
 * result is only ever used for the same market on both players, the shared vig largely cancels.
 */
function medianBookProbability(line: PropLine): number | null {
  const probabilities = line.books
    .map((book) => impliedProbability(book.price))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (probabilities.length === 0) return null;

  const middle = Math.floor(probabilities.length / 2);

  return probabilities.length % 2 === 0
    ? (probabilities[middle - 1] + probabilities[middle]) / 2
    : probabilities[middle];
}

/** The numeric value of a market: its line, or its probability for threshold markets. */
function valueOf(line: PropLine): number | null {
  if (THRESHOLD_MARKETS.has(line.statId)) {
    return impliedProbability(line.consensusPrice) ?? medianBookProbability(line);
  }

  if (line.consensusLine !== null) {
    const parsed = Number(line.consensusLine);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return impliedProbability(line.consensusPrice);
}

/** Points contributed by one market at a given magnitude. */
function pointsFor(statId: string, value: number, scoring: Scoring): number {
  switch (statId) {
    case 'passing_yards':
      return value / PASS_YARDS_PER_POINT;
    case 'passing_touchdowns':
      return value * POINTS_PER_PASSING_TD;
    case 'rushing_yards':
    case 'receiving_yards':
      return value / RUSH_REC_YARDS_PER_POINT;
    case 'receiving_receptions':
      return value * POINTS_PER_RECEPTION[scoring];
    // Anytime TD is a probability, so it contributes its expected value.
    case 'touchdowns':
      return value * POINTS_PER_TD;
    // 2+ TD adds only the SECOND touchdown. Anytime TD already counted the first, and every
    // player who scores twice also scored once, so these probabilities stack rather than
    // compete - adding the full 6 again would pay twice for one of the two scores.
    case 'touchdowns_2plus':
      return value * POINTS_PER_TD;
    case 'passing_touchdowns_2plus':
      // Passing TDs already carry a full count line, so a 2+ price would re-count what the
      // over/under total measures. It is shown as context, not scored.
      return 0;
    // Rushing TDs are a subset of anytime TD; counting both would double-count the same score.
    case 'rushing_touchdowns':
      return 0;
    default:
      return 0;
  }
}

/**
 * Projects a player's fantasy points. Returns null when too little is posted to be meaningful -
 * a player with no real lines at all should not appear as a confident zero.
 */
export function project(player: PlayerProps, scoring: Scoring): Projection | null {
  const baselines = player.position ? ABSENT_BASELINE[player.position] ?? {} : {};
  const breakdown: Projection['breakdown'] = [];
  const estimated: string[] = [];
  const postedStatIds = new Set<string>();
  let real = 0;

  for (const line of player.lines) {
    const posted = valueOf(line);
    const fallback = baselines[line.statId];

    // An absent market with no baseline (e.g. a QB's rushing line) contributes nothing rather
    // than being invented.
    const value = posted ?? fallback;
    if (value === undefined || value === null) continue;

    const wasEstimated = posted === null;
    if (wasEstimated) estimated.push(line.statId);
    else {
      real += 1;
      postedStatIds.add(line.statId);
    }

    const points = pointsFor(line.statId, value, scoring);
    if (points === 0) continue;

    breakdown.push({ statId: line.statId, market: line.market, points, estimated: wasEstimated });
  }

  // With nothing posted at all there is no projection to make - every number would be invented.
  if (real === 0) return null;

  breakdown.sort((a, b) => b.points - a.points);

  const expectedMarkets = player.position ? EXPECTED_MARKETS[player.position] ?? [] : [];

  // Coverage is measured against the markets the position is normally priced on. Counting every
  // posted line instead would let an extra market push a player past 100% coverage.
  const posted = expectedMarkets.length > 0
    ? expectedMarkets.filter((statId) => postedStatIds.has(statId)).length
    : real;

  return {
    points: breakdown.reduce((sum, entry) => sum + entry.points, 0),
    estimated,
    complete: estimated.length === 0,
    breakdown,
    posted,
    expected: expectedMarkets.length || real,
  };
}

/** Share of a position's normal markets that had a real posted line. */
export function coverage(projection: Projection): number {
  return projection.expected === 0 ? 1 : projection.posted / projection.expected;
}

export function formatPoints(points: number): string {
  return points.toFixed(1);
}
