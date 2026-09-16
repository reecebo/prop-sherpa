import type { PlayerProps } from '../api/types';
import { coverage, formatPoints, project, SCORING_LABELS } from '../api/projection';
import type { Scoring } from '../api/projection';
import { meaningfulGap, uncertaintyFor } from '../api/uncertainty';
import { BalanceBar } from './BalanceBar';

interface Props {
  players: (PlayerProps | null)[];
  scoring: Scoring;
  onScoringChange: (scoring: Scoring) => void;
}

/**
 * Below this share of a position's normal markets, a projection is mostly filled in rather than
 * read, and comparing it against a fully posted player would flatter whichever side was guessed.
 */
const THIN_COVERAGE = 0.5;

/**
 * The single answer the app exists to give: start this one.
 *
 * This carries only the call. The totals live on each player's card, where they sit beside the
 * markets that produced them - repeating them here made the header a second scoreboard and
 * pushed the actual answer into the corner.
 */
export function Verdict({ players, scoring, onScoringChange }: Props) {
  const [a, b] = players;

  const picker = (
    <div className="scoring" role="group" aria-label="Scoring format">
      {(Object.keys(SCORING_LABELS) as Scoring[]).map((format) => (
        <button
          key={format}
          type="button"
          className={format === scoring ? 'scoring-opt active' : 'scoring-opt'}
          aria-pressed={format === scoring}
          onClick={() => onScoringChange(format)}
        >
          {SCORING_LABELS[format]}
        </button>
      ))}
    </div>
  );

  if (!a || !b) {
    return (
      <section className="verdict verdict-idle">
        <p className="verdict-hint">Pick a player on each side to get a start/sit call.</p>
        {picker}
      </section>
    );
  }

  const projections = [project(a, scoring), project(b, scoring)];
  const [pa, pb] = projections;

  if (!pa || !pb) {
    const missing = !pa ? a : b;
    return (
      <section className="verdict verdict-idle">
        <p className="verdict-hint">
          No posted lines for <strong>{missing.name}</strong>, so there is nothing to project. The
          markets below still compare individually.
        </p>
        {picker}
      </section>
    );
  }

  const both = [a, b] as PlayerProps[];
  const coverages = projections.map((projection) => coverage(projection!));

  // A thin projection next to a full one is not a comparison, it is a guess against a fact.
  const lopsided =
    coverages.some((value) => value < THIN_COVERAGE) &&
    Math.abs(coverages[0] - coverages[1]) >= 0.25;

  if (lopsided) {
    const thin = coverages[0] < coverages[1] ? 0 : 1;

    return (
      <section className="verdict verdict-idle">
        <p className="verdict-line">
          <strong>Not comparable</strong> — {both[thin].name} has {projections[thin]!.posted} of{' '}
          {projections[thin]!.expected} markets posted.
        </p>
        <p className="verdict-caveat">
          Most of that projection is filled in from position averages, so a points gap against a
          fully priced player would say more about the estimate than the players.
        </p>
        {picker}
      </section>
    );
  }

  const uncertainties = projections.map((projection, index) =>
    uncertaintyFor(both[index], projection, scoring),
  );

  const gap = Math.abs(pa.points - pb.points);
  const threshold = meaningfulGap(uncertainties[0], uncertainties[1]);
  const tossUp = gap < threshold;
  const winner = pa.points >= pb.points ? 0 : 1;
  const estimated = projections.some((projection) => projection && !projection.complete);

  return (
    <section className="verdict" data-toss-up={tossUp || undefined}>
      <div className="verdict-call">
        {tossUp ? (
          <p className="verdict-line">
            <strong>Too close to call</strong>
            <span className="verdict-sub">
              {formatPoints(gap)} pts apart — these projections swing by more than that most
              weeks.
            </span>
          </p>
        ) : (
          <p className="verdict-line">
            Start <strong className="verdict-name">{both[winner].name}</strong>
            <span className="verdict-gap">+{formatPoints(gap)} pts</span>
          </p>
        )}

        {/* Estimated markets are flagged here, not buried, so the number is never trusted blind. */}
        {estimated && (
          <p className="verdict-caveat">
            Includes estimated markets where no line is posted — see the dotted values below.
          </p>
        )}
      </div>

      {/* The bar restates the call as a picture: how far the lean is, and whether it clears the
          band where a gap means nothing. */}
      <BalanceBar
        names={[a.name, b.name]}
        points={[pa.points, pb.points]}
        threshold={threshold}
      />

      {picker}
    </section>
  );
}
