import { impliedProbability } from './odds';
import type { PropLine } from './types';

/**
 * Line movement: how the market's opinion changed between open and now.
 *
 * This is deliberately limited to anytime TD. The provider exposes `openPrice` but no open
 * LINE, and on yardage and receptions markets the LINE carries the projection while the price
 * sits pinned near even money (69% of cached yardage rows are at +100, and +100 is by far the
 * most common open). Comparing open price to current price there would measure vig drift and
 * present it as a change of opinion, so those markets report no movement at all.
 *
 * On anytime TD the price IS the projection, so open to current is real. Available on 296 of
 * 340 cached players, with a median absolute move of 2.5 points of probability.
 */

/** Markets whose price carries the projection, and so can be compared open to now. */
const PRICE_IS_PROJECTION = new Set(['touchdowns']);

/** Movement below this is indistinguishable from noise and routine repricing. */
const NOISE_THRESHOLD = 0.02;

export interface Movement {
  /** Change in implied probability, positive when the market grew more confident. */
  delta: number;
  openPrice: string;
  currentPrice: string;
  /** False when the move is small enough to be routine repricing rather than a signal. */
  significant: boolean;
}

/** Movement for a market, or null when it cannot be read honestly. */
export function movementFor(line: PropLine): Movement | null {
  if (!PRICE_IS_PROJECTION.has(line.statId)) return null;
  if (!line.openPrice || !line.consensusPrice) return null;

  const open = impliedProbability(line.openPrice);
  const current = impliedProbability(line.consensusPrice);
  if (open === null || current === null) return null;

  const delta = current - open;

  return {
    delta,
    openPrice: line.openPrice,
    currentPrice: line.consensusPrice,
    significant: Math.abs(delta) >= NOISE_THRESHOLD,
  };
}

/** e.g. "+3.4 pts since open". Probability points, not odds points. */
export function formatMovement(movement: Movement): string {
  const sign = movement.delta > 0 ? '+' : '';
  return `${sign}${(movement.delta * 100).toFixed(1)} pts since open`;
}

export function movementDirection(movement: Movement): 'up' | 'down' {
  return movement.delta > 0 ? 'up' : 'down';
}
