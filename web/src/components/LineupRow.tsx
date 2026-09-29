import { formatKickoff, teamCode } from '../api/odds';
import { formatPoints } from '../api/projection';
import { formatRange } from '../api/uncertainty';
import type { ScoredBenchPlayer, ScoredPlayer, ScoredSlot } from '../api/lineup';
import { PlayerAvatar } from './PlayerAvatar';
import { Tooltip } from './Tooltip';
import { BenchedIcon, BetterStartIcon, ExpandIcon, ICON_SIZE, ICON_STROKE } from './icons';

const UNMATCHED_COPY: Record<string, string> = {
  'no-props': 'No line posted',
  'not-in-directory': 'Not in player list',
  ambiguous: 'Could not identify',
};

const UNMATCHED_HELP: Record<string, string> = {
  'no-props':
    'The books have not priced this player this week - either their game is outside the cached slate, or they draw too little action to post.',
  'not-in-directory':
    'Sleeper has this player but our copy of their player list does not. Updating the player list usually fixes it.',
  ambiguous:
    'Several players share this name and nothing in the data separates them. Left unmatched rather than guessing.',
};

interface RowProps {
  scored: ScoredPlayer | null;
  /** The chip in the first column: a lineup slot, or the player's position on the bench. */
  chip: string;
  open: boolean;
  onToggle: () => void;
  detailId: string;
  /** Set on a row that changed, in the direction it changed. */
  change?: Change;
}

/**
 * A move into or out of the lineup, described from this row's point of view.
 *
 * Both directions carry the same three things - which way, the other player, and the size of the
 * gap - so one shape covers a promoted bench player and a dropped starter alike.
 */
interface Change {
  direction: 'in' | 'out';
  other: ScoredPlayer | null;
  points: number | null;
}

/** One player: slot chip, identity, range, both projections, and the expand control. */
export function LineupRow({ scored, chip, open, onToggle, detailId, change }: Readonly<RowProps>) {
  const player = scored?.player;
  const props = player?.props;

  // The whole row is the target, not just the caret. A row with nothing to show stays inert, so
  // the pointer never promises a drawer that will not open.
  const expandable = Boolean(props);

  return (
    <tr
      className="lineup-row"
      data-expanded={open || undefined}
      data-change={change?.direction}
      data-expandable={expandable || undefined}
      onClick={expandable ? onToggle : undefined}
    >
      <th scope="row" className="slot-col">
        <span className="slot-chip" data-pos={player?.position ?? undefined}>
          {chip}
        </span>
      </th>

      <td className="player-col">
        {player ? (
          <div className="lineup-player">
            <PlayerAvatar
              sleeperId={player.sleeperId}
              name={player.name}
              position={player.position}
            />

            <div className="lineup-identity">
              <span className="lineup-name">
                {change && <ChangeMark change={change} name={player.name} />}
                {player.name}
                {player.injuryStatus && <span className="injury-badge">{player.injuryStatus}</span>}
              </span>

              <span className="lineup-sub">
                {player.position}
                {player.team && ` · ${player.team}`}
                {props && (
                  <>
                    {' '}
                    vs {teamCode(props.opponent)}
                    {props.kickoff && ` · ${formatKickoff(props.kickoff)}`}
                  </>
                )}
              </span>

              {change?.other && (
                <ChangeNote change={change} other={change.other} name={player.name} />
              )}
            </div>
          </div>
        ) : (
          <span className="lineup-empty">Nobody eligible</span>
        )}
      </td>

      <td className="range-col">
        {scored?.uncertainty ? (
          <Tooltip content="Where this player plausibly lands, about one standard deviation either side of the projection. A wide range means the total leans on touchdown equity, which is all-or-nothing.">
            <span>{formatRange(scored.uncertainty)}</span>
          </Tooltip>
        ) : (
          '—'
        )}
      </td>

      <td className="sleeper-col">
        {player?.sleeperPoints != null ? formatPoints(player.sleeperPoints) : '—'}
      </td>

      <td className="proj-col">
        {scored?.projection ? (
          formatPoints(scored.projection.points)
        ) : (
          <UnmatchedNote reason={player?.unmatched ?? null} />
        )}
      </td>

      <td className="expand-col">
        {props && (
          <button
            type="button"
            className="lineup-expand"
            // Toggles on its own and stops there: letting the click reach the row would toggle
            // twice and leave the drawer exactly as it was.
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={open ? `Hide ${player?.name} detail` : `Show ${player?.name} detail`}
          >
            <ExpandIcon size={ICON_SIZE.control} stroke={ICON_STROKE} aria-hidden="true" />
          </button>
        )}
      </td>
    </tr>
  );
}

/** A slot of the optimal lineup, adapting the slot's shape to the shared row. */
export function LineupSlotRow({
  scored,
  open,
  onToggle,
}: Readonly<{ scored: ScoredSlot; open: boolean; onToggle: () => void }>) {
  const { slot, starter, replaces, gained, upgraded } = scored;

  return (
    <LineupRow
      scored={starter}
      chip={slot.label}
      open={open}
      onToggle={onToggle}
      detailId={`slot-detail-${slot.index}`}
      change={upgraded ? { direction: 'in', other: replaces, points: gained } : undefined}
    />
  );
}

/** A bench player, with a demotion read from the losing side of the same swap. */
export function BenchRow({
  scored,
  open,
  onToggle,
}: Readonly<{ scored: ScoredBenchPlayer; open: boolean; onToggle: () => void }>) {
  const { player, replacedBy, lost, benched } = scored;

  return (
    <LineupRow
      scored={scored}
      chip={player.position ?? 'BN'}
      open={open}
      onToggle={onToggle}
      detailId={`bench-detail-${player.sleeperId}`}
      change={benched ? { direction: 'out', other: replacedBy, points: lost } : undefined}
    />
  );
}

/** The caret beside the name: up into the lineup, down out of it. */
function ChangeMark({ change, name }: Readonly<{ change: Change; name: string }>) {
  const promoted = change.direction === 'in';
  const Icon = promoted ? BetterStartIcon : BenchedIcon;

  const label = (() => {
    if (!change.other) {
      return promoted ? `Start ${name} - not in your current lineup.` : `Sit ${name}.`;
    }

    return promoted
      ? `Start ${name} over ${change.other.player.name}.`
      : `Sit ${name} for ${change.other.player.name}.`;
  })();

  return (
    <Tooltip content={label}>
      <span className="change-mark">
        <Icon size={ICON_SIZE.inline} aria-hidden="true" />
      </span>
    </Tooltip>
  );
}

/**
 * The swap itself, on its own line under the matchup.
 *
 * The point difference lives here rather than in a column of its own: beside the two projections
 * it read as the gap between them, when it is really the gap against a different player entirely.
 * Next to that player's name there is nothing else it could mean.
 */
function ChangeNote({
  change,
  other,
  name,
}: Readonly<{ change: Change; other: ScoredPlayer; name: string }>) {
  const promoted = change.direction === 'in';
  const verb = promoted ? 'over' : 'for';

  // Unpriced on one side: the change still stands, but its size cannot be stated without
  // inventing the missing half.
  if (change.points === null) {
    return (
      <Tooltip
        content={`${other.player.name} has no posted line, so there is no number to compare against. The change still stands - it is an improvement on an unpriced player.`}
      >
        <span className="lineup-change">
          {verb} {other.player.name}
          <span className="change-points lineup-none">n/a</span>
        </span>
      </Tooltip>
    );
  }

  const [better, worse] = promoted ? [name, other.player.name] : [other.player.name, name];

  return (
    <Tooltip
      content={`Starting ${better} over ${worse} projects ${formatPoints(Math.abs(change.points))} more points. Both numbers are medians, so a gap smaller than either player's range is closer to a coin flip than a certainty.`}
    >
      <span className="lineup-change">
        {verb} {other.player.name}
        <span className="change-points">
          {change.points >= 0 ? '+' : '−'}
          {formatPoints(Math.abs(change.points))}
        </span>
      </span>
    </Tooltip>
  );
}

function UnmatchedNote({ reason }: Readonly<{ reason: string | null }>) {
  if (!reason) return <span className="lineup-none">—</span>;

  return (
    <Tooltip content={UNMATCHED_HELP[reason] ?? ''}>
      <span className="no-props">{UNMATCHED_COPY[reason] ?? 'Unpriced'}</span>
    </Tooltip>
  );
}
