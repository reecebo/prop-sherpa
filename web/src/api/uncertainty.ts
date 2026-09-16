import type { Projection, Scoring } from './projection';
import type { PlayerProps } from './types';

/**
 * How much confidence a projection deserves.
 *
 * A projected total is a median, not a promise. Two players at 10.2 points are not
 * interchangeable: one built from eight receptions lands near 10 most weeks, while one built
 * from a touchdown price lands at 4 or 16 and rarely in between. The verdict has to know the
 * difference, because a 1.2 point gap is meaningless against a spread that wide.
 *
 * Nothing here is a real weekly distribution - that needs game logs we do not have. These are
 * deliberately coarse bands built from two things the cached odds DO show: how much of a
 * projection is all-or-nothing touchdown equity, and how far the books disagree with each other.
 */

/**
 * Week-to-week standard deviation of actual fantasy points, as a share of the projection.
 *
 * Published NFL scoring distributions put a skill player's weekly spread near half their mean.
 * QBs are the steadiest - more plays, and passing yards dominate a total that touchdowns only
 * nudge. These are rounded to one decimal because the underlying estimate does not justify more.
 */
const BASE_SPREAD: Record<string, number> = {
  QB: 0.3,
  RB: 0.45,
  WR: 0.5,
  TE: 0.55,
  FB: 0.5,
};

const DEFAULT_SPREAD = 0.5;

/**
 * Extra spread from touchdown equity, scaled by how much of the total it represents.
 *
 * A touchdown is 6 points or 0 - there is no partial credit - so a projection leaning on it is
 * far less reliable than the same number built from receptions. Measured across the cache, TD
 * share runs from 6% of a projection at the 10th percentile to 30% at the 90th, with a 17%
 * median, so this term moves the band meaningfully without dominating it.
 */
const TD_VOLATILITY = 0.6;

export interface Uncertainty {
  /** Estimated standard deviation in fantasy points. */
  spread: number;
  /** Plausible low and high outcomes - roughly one standard deviation either way. */
  floor: number;
  ceiling: number;
  /** Share of the projection that comes from all-or-nothing touchdown equity. */
  tdShare: number;
}

/**
 * Estimates the range a projection could plausibly land in. Returns null when there is no
 * projection to qualify.
 */
export function uncertaintyFor(
  player: PlayerProps,
  projection: Projection | null,
  _scoring: Scoring,
): Uncertainty | null {
  if (!projection || projection.points <= 0) return null;

  const tdPoints = projection.breakdown
    .filter((entry) => entry.statId === 'touchdowns')
    .reduce((sum, entry) => sum + entry.points, 0);

  const tdShare = tdPoints / projection.points;

  const base = (player.position ? BASE_SPREAD[player.position] : undefined) ?? DEFAULT_SPREAD;
  // Touchdown equity adds volatility on top of the position's baseline rather than replacing it.
  const spread = projection.points * (base + tdShare * TD_VOLATILITY);

  return {
    spread,
    floor: Math.max(0, projection.points - spread),
    ceiling: projection.points + spread,
    tdShare,
  };
}

/**
 * Fraction of the combined spread a gap must clear before it counts as a call.
 *
 * A start/sit decision does not need confidence that one player outscores the other - it needs
 * the better side of a coin that is not quite fair. Requiring a full standard deviation would
 * label every realistic matchup a toss-up, including ones with a clear favourite; measured
 * against the cache, 0.35 leaves genuine gaps like a top QB over a mid one as calls while still
 * refusing anything inside a couple of points.
 */
const GAP_FRACTION = 0.35;

/**
 * How much of a player's week-to-week variance is specific to them rather than shared.
 *
 * Two players' outcomes are not independent - pace, game script and weather move whole slates
 * together - so the spread of the DIFFERENCE between them is smaller than combining their
 * individual spreads would suggest. This discounts the shared portion before comparing.
 */
const IDIOSYNCRATIC = 0.75;

/**
 * How far apart two projections must be before the gap outruns the noise in their difference.
 *
 * The relevant quantity is the uncertainty in the gap, not in either projection alone.
 * Independent parts combine in quadrature, so the two spreads are discounted to their
 * player-specific share and then added that way rather than summed.
 */
export function meaningfulGap(a: Uncertainty | null, b: Uncertainty | null): number {
  if (!a || !b) return 1;
  return GAP_FRACTION * IDIOSYNCRATIC * Math.hypot(a.spread, b.spread);
}

export function formatRange(uncertainty: Uncertainty): string {
  return `${uncertainty.floor.toFixed(1)}-${uncertainty.ceiling.toFixed(1)}`;
}
