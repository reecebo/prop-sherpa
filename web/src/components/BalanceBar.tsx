import { formatPoints } from '../api/projection';

/**
 * Which way the comparison leans, as a bar.
 *
 * Borrowed from trade calculators, with one change that matters. A trade calculator weighs two
 * fixed values, so the split is just a ratio. A projection is a median with a band around it, and
 * a 1-point gap between two players who each swing 8 points either way is not a lean at all - a
 * plain ratio bar would draw it as one and read as far more confident than the data supports.
 *
 * So the bar carries the toss-up zone with it: the shaded centre is the span inside which the gap
 * is indistinguishable from noise, taken from the same threshold the verdict uses. A marker
 * sitting inside that band is visibly not a call, which is the honest picture.
 */

interface Props {
  names: [string, string];
  points: [number, number];
  /** Gap below which the two are indistinguishable - `meaningfulGap` from the uncertainty model. */
  threshold: number;
}

/**
 * How far from centre a gap of exactly one threshold sits. Below a full threshold the marker
 * stays inside the shaded band; beyond it, the bar keeps moving but with diminishing travel, so a
 * blowout never pins to the end and stops being readable.
 */
const THRESHOLD_TRAVEL = 0.3;

export function BalanceBar({ names, points, threshold }: Readonly<Props>) {
  const gap = points[0] - points[1];
  const magnitude = Math.abs(gap);

  // Scale in units of the threshold, so the same visual lean always means the same confidence.
  const ratio = threshold > 0 ? magnitude / threshold : 0;

  /*
   * Linear inside the toss-up band, compressed outside it. A gap of one threshold sits exactly at
   * the band's edge; past that, each additional threshold moves the marker less than the last, so
   * the bar stays informative across both a 2-point and a 20-point difference.
   */
  const travel =
    ratio <= 1
      ? ratio * THRESHOLD_TRAVEL
      : THRESHOLD_TRAVEL + (1 - THRESHOLD_TRAVEL) * (1 - 1 / (1 + (ratio - 1) * 0.6));

  // 50% is dead even; positive gap favours the left player, so the marker moves left.
  const position = 50 - Math.sign(gap) * travel * 50;
  const tossUp = magnitude < threshold;
  const leader = gap >= 0 ? 0 : 1;

  return (
    <div className="balance">
      <div
        className="balance-track"
        data-toss-up={tossUp || undefined}
        role="img"
        aria-label={
          tossUp
            ? `Too close to call — ${formatPoints(magnitude)} points apart, inside the margin of error`
            : `${names[leader]} favoured by ${formatPoints(magnitude)} points`
        }
      >
        {/*
         * The span where a gap says nothing, labelled rather than left as a texture. Sized from
         * the same threshold the verdict tests against, so the picture and the wording can never
         * disagree.
         */}
        <span
          className="balance-deadzone"
          style={{
            left: `${50 - THRESHOLD_TRAVEL * 50}%`,
            right: `${50 - THRESHOLD_TRAVEL * 50}%`,
          }}
          aria-hidden="true"
        >
          <span className="balance-deadzone-label">too close</span>
        </span>

        {/* The filled span runs from centre to the marker, so the lean has length, not just a
            position - the direction is readable without finding the midpoint first. */}
        <span
          className="balance-fill"
          style={
            gap >= 0
              ? { left: `${position}%`, right: '50%' }
              : { left: '50%', right: `${100 - position}%` }
          }
          aria-hidden="true"
        />

        <span className="balance-marker" style={{ left: `${position}%` }} aria-hidden="true" />
      </div>

      {/* Names sit under their own half, pointing inwards at the bar they describe. The leader is
          named with the gap, so the bar reads without cross-referencing the headline. */}
      <div className="balance-names">
        <span className="balance-name" data-lead={!tossUp && leader === 0 ? '' : undefined}>
          {names[0]}
          {!tossUp && leader === 0 && (
            <span className="balance-by">+{formatPoints(magnitude)}</span>
          )}
        </span>
        <span className="balance-name" data-lead={!tossUp && leader === 1 ? '' : undefined}>
          {!tossUp && leader === 1 && (
            <span className="balance-by">+{formatPoints(magnitude)}</span>
          )}
          {names[1]}
        </span>
      </div>
    </div>
  );
}
