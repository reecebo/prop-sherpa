import type { PlayerProps } from '../api/types';
import { formatKickoff, formatTeam } from '../api/odds';
import type { MarketEdge } from '../api/edge';
import { formatPoints, project } from '../api/projection';
import type { Projection, Scoring } from '../api/projection';
import { uncertaintyFor } from '../api/uncertainty';
import { PropsTable } from './PropsTable';
import { Tooltip } from './Tooltip';
import { ICON_SIZE, ICON_STROKE, RemoveIcon } from './icons';
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

export function PlayerPanel({ player, books, edges, side, scoring, wins, onRemove }: Props) {
  if (!player) {
    return (
      <section className="panel panel-empty">
        <p>Search for a player to fill this side.</p>
      </section>
    );
  }

  const projection = project(player, scoring);
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
          <RemoveIcon size={ICON_SIZE.control} stroke={ICON_STROKE} aria-hidden="true" />
        </button>
      </header>

      <PropsTable
        player={player}
        books={books}
        scoring={scoring}
        edges={edges}
        side={side}
      />
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
