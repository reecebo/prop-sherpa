import { Fragment } from "react";
import type {
  ScoredBenchPlayer,
  ScoredPlayer,
  ScoredSlot,
} from "../api/lineup";
import { alternativesFor, startingIds } from "../api/lineup";
import type { ScoringRules } from "../api/projection";
import { BenchRow, LineupSlotRow } from "./LineupRow";
import { SlotDrawer } from "./SlotDrawer";
import { Tooltip } from "./Tooltip";

interface Props {
  slots: ScoredSlot[];
  bench: ScoredBenchPlayer[];
  books: string[];
  scoring: ScoringRules;
  /** The open row, as `slot-{index}` or `bench-{sleeperId}`. One at a time across both sections. */
  openRow: string | null;
  onToggleRow: (key: string | null) => void;
}

const COLUMNS = 6;

export function LineupTable({
  slots,
  bench,
  books,
  scoring,
  openRow,
  onToggleRow,
}: Readonly<Props>) {
  const starting = startingIds(slots);

  return (
    <div className="lineup-wrap">
      <table className="lineup">
        <thead>
          <tr>
            <th className="slot-col">Slot</th>
            <th className="player-col">Player</th>
            <th className="range-col">
              <Tooltip content="The plausible spread around our projection, roughly one standard deviation either way.">
                Range
              </Tooltip>
            </th>
            <th className="sleeper-col">
              <Tooltip content="Sleeper's own weekly projection, from their projection vendor. Shown for contrast - it is not used in any calculation here.">
                Sleeper
              </Tooltip>
            </th>
            <th className="proj-col">
              <Tooltip content="Our projection, built from sportsbook prop lines with the books' margin stripped out.">
                Prop Sherpa
              </Tooltip>
            </th>
            <th className="expand-col" aria-label="Detail" />
          </tr>
        </thead>

        <tbody>
          {slots.map((scored) => {
            const key = `slot-${scored.slot.index}`;

            return (
              <Row
                key={key}
                rowKey={key}
                open={openRow === key}
                detailId={`slot-detail-${scored.slot.index}`}
                scored={scored.starter}
                alternatives={alternativesFor(scored, slots)}
                starting={starting}
                books={books}
                scoring={scoring}
              >
                <LineupSlotRow
                  scored={scored}
                  open={openRow === key}
                  onToggle={() => onToggleRow(openRow === key ? null : key)}
                />
              </Row>
            );
          })}
        </tbody>

        {bench.length > 0 && (
          <tbody className="lineup-bench">
            <tr className="lineup-section">
              <th scope="colgroup" colSpan={COLUMNS}>
                Bench
              </th>
            </tr>

            {bench.map((scored) => {
              const key = `bench-${scored.player.sleeperId}`;

              return (
                <Row
                  key={key}
                  rowKey={key}
                  open={openRow === key}
                  detailId={`bench-detail-${scored.player.sleeperId}`}
                  scored={scored}
                  alternatives={alternativesFor(scored, slots)}
                  starting={starting}
                  books={books}
                  scoring={scoring}
                >
                  <BenchRow
                    scored={scored}
                    open={openRow === key}
                    onToggle={() => onToggleRow(openRow === key ? null : key)}
                  />
                </Row>
              );
            })}
          </tbody>
        )}
      </table>
    </div>
  );
}

/**
 * A row plus its drawer.
 *
 * The drawer is a sibling row rather than a nested element, so the columns stay aligned with every
 * other row in the table.
 */
function Row({
  children,
  open,
  detailId,
  scored,
  alternatives,
  starting,
  books,
  scoring,
}: Readonly<{
  children: React.ReactNode;
  rowKey: string;
  open: boolean;
  detailId: string;
  scored: ScoredPlayer | null;
  alternatives: ScoredPlayer[];
  starting: ReadonlySet<string>;
  books: string[];
  scoring: ScoringRules;
}>) {
  return (
    <Fragment>
      {children}

      {open && scored && (
        <tr className="lineup-drawer-row" id={detailId}>
          <td colSpan={COLUMNS}>
            {/* A table row cannot be animated - browsers ignore height on <tr> - so the grid
                wrapper inside the cell is what expands. */}
            <div className="drawer-reveal">
              <div className="drawer-reveal-inner">
                <SlotDrawer
                  scored={scored}
                  alternatives={alternatives}
                  starting={starting}
                  books={books}
                  scoring={scoring}
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
