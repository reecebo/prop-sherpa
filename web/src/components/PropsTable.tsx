import type { PlayerProps, PropLine } from '../api/types';
import { bestQuoteIndexes } from '../api/odds';
import { basisFor, comparableValue, formatValue, isAbsent, isBookDerived } from '../api/edge';
import type { MarketEdge } from '../api/edge';
import { formatMovement, movementDirection, movementFor } from '../api/movement';
import { formatPoints, project } from '../api/projection';
import type { Scoring, ScoringRules } from '../api/projection';
import { Tooltip } from './Tooltip';
import {
  BetterStartIcon,
  ICON_SIZE,
  ICON_STROKE,
  MovementDownIcon,
  MovementUpIcon,
} from './icons';

interface Props {
  player: PlayerProps;
  books: string[];
  scoring: Scoring | ScoringRules;
  /**
   * Per-market comparison against another player. Omit it and the table renders the same rows
   * without winner marks, which is what a single player's detail view wants.
   */
  edges?: Map<string, MarketEdge>;
  /** Which side of that comparison this player is. Meaningless without `edges`. */
  side?: number;
}

function BookCell({ line, book, best }: Readonly<{ line: PropLine | undefined; book: string; best: boolean }>) {
  const quote = line?.books.find((entry) => entry.book === book);

  if (!quote) return <td className="cell-empty">—</td>;

  return (
    <td className={best ? 'quote best-bet' : 'quote'}>
      {/* Line and price stay together - a price without its line is not comparable. */}
      {quote.line && <span className="q-line">{quote.line}</span>}
      <span className="q-price">{quote.price ?? '—'}</span>
    </td>
  );
}

/** Every market for one player: the margin-free number, its point value, and each book's price. */
export function PropsTable({ player, books, scoring, edges, side }: Readonly<Props>) {
  // Only show book columns this player actually has odds for, so the table stays readable.
  const activeBooks = books.filter((book) =>
    player.lines.some((line) => line.books.some((quote) => quote.book === book)),
  );

  const projection = project(player, scoring);
  // Points per market, so the total can be traced back to the rows that produced it.
  const points = new Map(projection?.breakdown.map((entry) => [entry.statId, entry]) ?? []);

  return (
    <div className="table-wrap">
      <table className="props">
        <thead>
          <tr>
            <th className="market-col">Market</th>
            <th className="fair-col">
              <Tooltip content="The market's true estimate, with the books' built-in profit margin stripped out. This is what start/sit decisions compare on.">
                Projection
              </Tooltip>
            </th>
            <th className="pts-col">
              <Tooltip content="Fantasy points this market contributes to the projection.">
                Pts
              </Tooltip>
            </th>
            {activeBooks.map((book) => (
              <th key={book} className="book-col">
                <Tooltip content="Book price — use for placing a bet, not for start/sit.">
                  {book}
                </Tooltip>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {player.lines.map((line) => {
            const edge = edges?.get(line.statId);
            const wins = edge !== undefined && edge.winner === side;
            const basis = basisFor(line);
            const value = comparableValue(line);
            const best = bestQuoteIndexes(line.books);
            const bestBooks = new Set([...best].map((index) => line.books[index]?.book));
            const movement = movementFor(line);
            const contribution = points.get(line.statId);

            return (
              <tr key={line.statId} className={wins ? 'row-wins' : undefined}>
                <th scope="row" className="market-col">
                  <span className="market-cell">
                    <span className="market-name">{line.market}</span>
                    {/* Movement only appears where the price is the projection, so it is never
                        showing vig drift as though it were a change of opinion. It stays in
                        this column because it describes the market's own history, not a
                        comparison between the two players. */}
                    {movement?.significant && (
                      <Tooltip
                        content={`Opened ${movement.openPrice}, now ${movement.currentPrice} — ${formatMovement(movement)}`}
                      >
                        <span className="move-badge" data-dir={movementDirection(movement)}>
                          {movementDirection(movement) === 'up' ? (
                            <MovementUpIcon size={ICON_SIZE.inline} stroke={ICON_STROKE} aria-hidden="true" />
                          ) : (
                            <MovementDownIcon size={ICON_SIZE.inline} stroke={ICON_STROKE} aria-hidden="true" />
                          )}
                          {(movement.delta * 100).toFixed(1)}
                        </span>
                      </Tooltip>
                    )}
                  </span>
                </th>

                <td className="fair-col">
                  {isAbsent(line) ? (
                    // The position calls for this market but no book posted a line - that
                    // absence is a usage signal, so the row stays visible.
                    <span className="no-line">not offered</span>
                  ) : (
                    <>
                      <span className="fair-row">
                        <span className="fair-value">{formatValue(value, basis)}</span>
                        {basis === 'line' && line.consensusPrice && (
                          <span className="fair-price">{line.consensusPrice}</span>
                        )}
                        {/* The margin belongs with the number it is a margin over - in the
                            market column it read as part of the market's name. */}
                        {wins && (
                          <Tooltip
                            className="edge-tip"
                            content={`Better ${basis === 'probability' ? 'scoring chance' : 'projection'} by ${edge?.margin}`}
                          >
                            <span className="edge-badge">
                              <BetterStartIcon size={ICON_SIZE.inline} aria-hidden="true" />
                              {edge?.margin}
                            </span>
                          </Tooltip>
                        )}
                      </span>
                      {/* A bar makes "more likely" read as bigger, which a price does not. */}
                      {basis === 'probability' && value !== null && (
                        <span className="likelihood" aria-hidden="true">
                          <span className="likelihood-fill" style={{ width: `${Math.min(100, value * 100)}%` }} />
                        </span>
                      )}
                      {/* The 2+ markets have no fair-odds consensus, so their number still
                          carries book margin and reads slightly high. Inline, because a block
                          here made only some rows taller and broke alignment across panels. */}
                      {isBookDerived(line) && (
                        <Tooltip content="Taken from the median book price. No margin-free number is published for this market, so this reads slightly high — treat it as a ceiling.">
                          <span className="vig-flag">reads high</span>
                        </Tooltip>
                      )}
                    </>
                  )}
                </td>

                <td className="pts-col">
                  {contribution ? (
                    // Only an estimate carries a hint; wrapping every value would make a plain
                    // number look like it had something to explain.
                    contribution.estimated ? (
                      <Tooltip content="Estimated — no line posted for this market.">
                        <span className="pts pts-est">{formatPoints(contribution.points)}</span>
                      </Tooltip>
                    ) : (
                      <span className="pts">{formatPoints(contribution.points)}</span>
                    )
                  ) : (
                    <span className="pts-none">—</span>
                  )}
                </td>

                {activeBooks.map((book) => (
                  <BookCell key={book} line={line} book={book} best={bestBooks.has(book)} />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {activeBooks.length === 0 && (
        <p className="books-empty">No book odds on this plan — consensus only.</p>
      )}
    </div>
  );
}
