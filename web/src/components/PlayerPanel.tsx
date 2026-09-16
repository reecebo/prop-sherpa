import type { PlayerProps, PropLine } from '../api/types';
import { bestQuoteIndexes, formatKickoff, formatTeam } from '../api/odds';
import { basisFor, comparableValue, formatValue, isAbsent, isBookDerived } from '../api/edge';
import type { MarketEdge } from '../api/edge';
import { formatMovement, movementDirection, movementFor } from '../api/movement';
import { formatPoints, project } from '../api/projection';
import type { Projection, Scoring } from '../api/projection';
import { uncertaintyFor } from '../api/uncertainty';
import { Tooltip } from './Tooltip';
import type { Uncertainty } from '../api/uncertainty';

interface Props {
  player: PlayerProps | null;
  books: string[];
  /** Edge per statId, computed across both panels so the winner can be marked here. */
  edges: Map<string, MarketEdge>;
  /** Which side of the split this panel is, so it can find itself in the edge result. */
  side: number;
  scoring: Scoring;
  /** True when the start/sit call favours this player, so the card can carry the answer. */
  wins: boolean;
  onRemove: () => void;
}

function BookCell({ line, book, best }: { line: PropLine | undefined; book: string; best: boolean }) {
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

export function PlayerPanel({ player, books, edges, side, scoring, wins, onRemove }: Props) {
  if (!player) {
    return (
      <section className="panel panel-empty">
        <p>Search for a player to fill this side.</p>
      </section>
    );
  }

  // Only show book columns this player actually has odds for, so the table stays readable.
  const activeBooks = books.filter((book) =>
    player.lines.some((line) => line.books.some((quote) => quote.book === book)),
  );

  const projection = project(player, scoring);
  // Points per market, so the total can be traced back to the rows that produced it.
  const points = new Map(projection?.breakdown.map((entry) => [entry.statId, entry]) ?? []);
  const uncertainty = uncertaintyFor(player, projection, scoring);

  return (
    <section className="panel">
      <header className="panel-head">
        <div className="panel-id">
          <h2>
            {player.name}
            {player.position && <span className="pos-chip" data-pos={player.position}>{player.position}</span>}
          </h2>
          <p className="panel-meta">
            {formatTeam(player.team)} vs {formatTeam(player.opponent)} · {formatKickoff(player.kickoff)}
          </p>
        </div>

        {projection && <Total projection={projection} uncertainty={uncertainty} wins={wins} />}

        {/* Clearing a slot is rare and reversible, so it stays a quiet affordance rather than
            competing with the projection for attention. */}
        <button
          type="button"
          className="remove"
          onClick={onRemove}
          aria-label={`Remove ${player.name}`}
          title={`Remove ${player.name}`}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="table-wrap">
        <table className="props">
          <thead>
            <tr>
              <th className="market-col">Market</th>
              <th className="fair-col">
                <Tooltip content="De-vigged consensus. This is what start/sit decisions compare on.">
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
              const edge = edges.get(line.statId);
              const wins = edge?.winner === side;
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
                            {movementDirection(movement) === 'up' ? '↗' : '↘'}{' '}
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
                              <span className="edge-badge">▲ {edge?.margin}</span>
                            </Tooltip>
                          )}
                        </span>
                        {/* A bar makes "more likely" read as bigger, which a price does not. */}
                        {basis === 'probability' && value !== null && (
                          <span className="likelihood" aria-hidden="true">
                            <span className="likelihood-fill" style={{ width: `${Math.min(100, value * 100)}%` }} />
                          </span>
                        )}
                        {/* The 2+ markets have no de-vigged consensus, so their number still
                            carries book margin and reads slightly high. Inline, because a block
                            here made only some rows taller and broke alignment across panels. */}
                        {isBookDerived(line) && (
                          <Tooltip content="Median book price — no de-vigged consensus is published for this market, so it includes the book's margin.">
                            <span className="vig-flag">+vig</span>
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
                    <BookCell
                      key={book}
                      line={line}
                      book={book}
                      best={bestBooks.has(book)}
                    />
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
    </section>
  );
}

/**
 * A player's projected total, sitting with the markets that produced it.
 *
 * The likely range is stated as a span rather than a raw pair of numbers: "12.9-26.8" reads as a
 * second score to compare, when it is really an admission that the total above it is a median
 * with a wide band around it.
 */
function Total({
  projection,
  uncertainty,
  wins,
}: {
  projection: Projection;
  uncertainty: Uncertainty | null;
  wins: boolean;
}) {
  const tdHeavy = uncertainty !== null && uncertainty.tdShare >= 0.3;

  return (
    <div className={wins ? 'total total-win' : 'total'}>
      <div className="total-points">
        {formatPoints(projection.points)}
        <span className="total-unit">pts</span>
      </div>

      <div className="total-meta">
        {uncertainty && (
          <Tooltip content="Roughly one standard deviation either side of the projection.">
            {formatPoints(uncertainty.floor)}–{formatPoints(uncertainty.ceiling)}
          </Tooltip>
        )}
        <Tooltip
          className="total-sep"
          content="Markets with a posted line, out of those this position is normally priced on."
        >
          {projection.posted}/{projection.expected}
        </Tooltip>
        {!projection.complete && (
          <Tooltip content="Some markets are estimated — no line posted.">
            <span className="total-est">est</span>
          </Tooltip>
        )}
        {tdHeavy && (
          <Tooltip
            content={`${Math.round(uncertainty!.tdShare * 100)}% of this projection is touchdown equity, which lands at 6 or 0.`}
          >
            <span className="total-volatile">TD</span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
