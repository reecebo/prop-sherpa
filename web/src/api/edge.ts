import { impliedProbability } from './odds';
import type { PropLine } from './types';

/**
 * How a market gets compared between players.
 *
 * Over/under markets (yards, receptions) publish `fairOverUnder` as a median projection priced
 * at even money - St. Brown shows 87 yards @ +100 while books sit near 79.5. The line is the
 * projection, so those markets compare on the line, not the price.
 *
 * Anytime TD has no line at all; its `fairOdds` is a genuine de-vigged price, so it compares on
 * implied probability. Higher probability is the better bet to start.
 */
export type Basis = 'line' | 'probability';

/**
 * Markets posted at a fixed threshold (2+ touchdowns is over 1.5). The line is the same for
 * everyone, so it carries no information - the price is what separates players.
 */
const THRESHOLD_MARKETS = new Set(['touchdowns_2plus', 'passing_touchdowns_2plus']);

export function basisFor(line: PropLine): Basis {
  if (THRESHOLD_MARKETS.has(line.statId)) return 'probability';

  // An absent line has no basis of its own; treat it as the price-based form so a missing
  // anytime-TD row still reads correctly.
  return line.consensusLine === null ? 'probability' : 'line';
}

/** Median book price as a probability, for markets the provider gives no fair number for. */
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

/** True when the position calls for this market but no book posted a line. */
export function isAbsent(line: PropLine): boolean {
  if (THRESHOLD_MARKETS.has(line.statId)) {
    return line.consensusPrice === null && line.books.length === 0;
  }

  return line.consensusLine === null && line.consensusPrice === null;
}

/** The comparable number for a market, or null when there is nothing to compare. */
export function comparableValue(line: PropLine): number | null {
  if (isAbsent(line)) return null;

  if (THRESHOLD_MARKETS.has(line.statId)) {
    return impliedProbability(line.consensusPrice) ?? medianBookProbability(line);
  }

  if (basisFor(line) === 'probability') {
    return impliedProbability(line.consensusPrice);
  }

  const value = Number(line.consensusLine);
  return Number.isFinite(value) ? value : null;
}

/** True when a market's number came from book prices rather than a de-vigged consensus. */
export function isBookDerived(line: PropLine): boolean {
  return THRESHOLD_MARKETS.has(line.statId) && line.consensusPrice === null;
}

export interface MarketEdge {
  /** Index of the winning player, or null when values tie or cannot be compared. */
  winner: number | null;
  values: (number | null)[];
  basis: Basis;
  /** Human-readable margin, e.g. "+12.5 yds" or "+4.2%". */
  margin: string | null;
}

/**
 * Compares one market across players. Both bases are "higher is better": more projected yards,
 * or a higher chance of scoring.
 */
export function edgeFor(lines: (PropLine | undefined)[]): MarketEdge {
  // Pick the basis from a line that actually has data - an absent row would mislabel it.
  const present = lines.find((line): line is PropLine => line !== undefined && !isAbsent(line))
    ?? lines.find((line): line is PropLine => line !== undefined);

  const basis: Basis = present ? basisFor(present) : 'line';

  const values = lines.map((line) => (line ? comparableValue(line) : null));
  const scored = values.filter((value): value is number => value !== null);

  if (scored.length < 2) {
    return { winner: null, values, basis, margin: null };
  }

  const best = Math.max(...scored);
  const winners = values.filter((value) => value === best).length;

  // A tie is not an edge - leave it unmarked rather than picking arbitrarily.
  if (winners > 1) return { winner: null, values, basis, margin: null };

  const runnerUp = Math.max(...scored.filter((value) => value !== best));
  const gap = best - runnerUp;

  return {
    winner: values.indexOf(best),
    values,
    basis,
    margin: basis === 'probability'
      ? `+${(gap * 100).toFixed(1)}%`
      : `+${Number(gap.toFixed(1))}`,
  };
}

/** Formats a comparable value for display under a player's name. */
export function formatValue(value: number | null, basis: Basis): string {
  if (value === null) return '—';
  return basis === 'probability' ? `${(value * 100).toFixed(1)}%` : String(Number(value.toFixed(1)));
}
