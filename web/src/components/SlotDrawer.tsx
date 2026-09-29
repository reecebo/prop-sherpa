import { useState } from 'react';
import { edgeFor } from '../api/edge';
import type { MarketEdge } from '../api/edge';
import { formatPoints } from '../api/projection';
import type { ScoringRules } from '../api/projection';
import type { ScoredPlayer } from '../api/lineup';
import type { PlayerProps } from '../api/types';
import { PropsTable } from './PropsTable';

interface Props {
  scored: ScoredPlayer;
  /** Everyone this player can be weighed against, best first. */
  alternatives: ScoredPlayer[];
  /** Ids currently in the optimal lineup, so an alternative says which side it is on. */
  starting: ReadonlySet<string>;
  books: string[];
  scoring: ScoringRules;
}

/** Per-market comparison between two players, keyed by statId. */
function edgesBetween(a: PlayerProps, b: PlayerProps): Map<string, MarketEdge> {
  const result = new Map<string, MarketEdge>();
  const statIds = new Set([...a.lines, ...b.lines].map((line) => line.statId));

  for (const statId of statIds) {
    result.set(
      statId,
      edgeFor([a, b].map((player) => player.lines.find((line) => line.statId === statId))),
    );
  }

  return result;
}

/**
 * The detail behind one player: their markets, and optionally another player beside them so the
 * gap can be read market by market.
 */
export function SlotDrawer({ scored, alternatives, starting, books, scoring }: Readonly<Props>) {
  const [comparingId, setComparingId] = useState<string | null>(null);

  const comparing = alternatives.find((c) => c.player.sleeperId === comparingId) ?? null;

  const props = scored.player.props;
  const comparingProps = comparing?.player.props ?? null;

  // Not memoized: this is a handful of markets over two players, and only when a comparison is
  // open. The bookkeeping would cost more than the work.
  const edges = props && comparingProps ? edgesBetween(props, comparingProps) : undefined;

  if (!props) return null;

  return (
    <div className="slot-drawer">
      {alternatives.length > 0 && (
        <div className="slot-compare">
          <span className="slot-compare-label">Compare with</span>

          <div className="slot-compare-options">
            {alternatives.map((candidate) => {
              const active = candidate.player.sleeperId === comparingId;

              return (
                <button
                  key={candidate.player.sleeperId}
                  type="button"
                  className={active ? 'slot-compare-opt active' : 'slot-compare-opt'}
                  aria-pressed={active}
                  data-bench={starting.has(candidate.player.sleeperId) ? undefined : true}
                  onClick={() => setComparingId(active ? null : candidate.player.sleeperId)}
                >
                  {candidate.player.name}
                  {candidate.projection && (
                    <span className="slot-compare-pts">
                      {formatPoints(candidate.projection.points)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="slot-drawer-split" data-comparing={comparing ? true : undefined}>
        <Column
          scored={scored}
          role={starting.has(scored.player.sleeperId) ? 'Starting' : 'Bench'}
          books={books}
          scoring={scoring}
          edges={edges}
          side={0}
        />

        {comparing && (
          <Column
            scored={comparing}
            role={starting.has(comparing.player.sleeperId) ? 'Starting' : 'Bench'}
            books={books}
            scoring={scoring}
            edges={edges}
            side={1}
          />
        )}
      </div>
    </div>
  );
}

function Column({
  scored,
  role,
  books,
  scoring,
  edges,
  side,
}: Readonly<{
  scored: ScoredPlayer;
  role: string;
  books: string[];
  scoring: ScoringRules;
  edges?: Map<string, MarketEdge>;
  side?: number;
}>) {
  if (!scored.player.props) return null;

  return (
    <div className="slot-column">
      <header className="slot-column-head">
        <span className="slot-role">{role}</span>
        <span className="slot-column-name">{scored.player.name}</span>
        {scored.projection && (
          <span className="slot-column-points">{formatPoints(scored.projection.points)} pts</span>
        )}
      </header>

      <PropsTable
        player={scored.player.props}
        books={books}
        scoring={scoring}
        edges={edges}
        side={side}
      />
    </div>
  );
}
