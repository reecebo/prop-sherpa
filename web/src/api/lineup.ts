import { project } from './projection';
import type { Projection, ScoringRules } from './projection';
import { uncertaintyFor } from './uncertainty';
import type { Uncertainty } from './uncertainty';
import type { LeagueScoring, LineupPlayer, LineupSlot } from './types';

/**
 * Scores the lineup the server picked.
 *
 * Choosing who starts happens on the server, which can see the whole roster at once. This side
 * only produces the numbers that get displayed, using the same projection and uncertainty model
 * the compare page uses.
 */

/**
 * Turns a league's scoring settings into the rules the projection model takes.
 *
 * Sleeper pays rushing and receiving yards separately, but the props only carry one yardage number
 * per market and every common ruleset pays the two alike, so they collapse into one rate. Same for
 * rushing and receiving touchdowns, which the anytime-TD market cannot tell apart anyway.
 */
export function rulesFrom(scoring: LeagueScoring): ScoringRules {
  return {
    passYd: scoring.passYd,
    passTd: scoring.passTd,
    rushRecYd: scoring.recYd,
    rec: scoring.rec,
    td: scoring.recTd,
    bonusRecTe: scoring.bonusRecTe ?? undefined,
  };
}

export interface ScoredPlayer {
  player: LineupPlayer;
  /** Null when the books posted nothing, which must never be read as zero points. */
  projection: Projection | null;
  uncertainty: Uncertainty | null;
}

export interface ScoredSlot {
  slot: LineupSlot;
  starter: ScoredPlayer | null;
  /** Everyone else eligible for this slot, best first, for the drawer. */
  candidates: ScoredPlayer[];
  /** The player this one displaces from the current lineup, scored for comparison. */
  replaces: ScoredPlayer | null;
  /** Points gained over the displaced player. Null when there is nobody to compare against. */
  gained: number | null;
  /**
   * Whether to present this as a change. Not the server's flag: a pairing this side's numbers
   * contradict is shown as an ordinary row rather than an upgrade it cannot justify.
   */
  upgraded: boolean;
}

/** A bench player, with the change away from the lineup the manager set read from their side. */
export interface ScoredBenchPlayer extends ScoredPlayer {
  /** The player taking their place, when the swap pairs to one. */
  replacedBy: ScoredPlayer | null;
  /** Points given up by benching them, as a negative number. */
  lost: number | null;
  /** Whether to present this as a demotion. The mirror of a slot's `upgraded`. */
  benched: boolean;
}

export function scorePlayer(player: LineupPlayer, rules: ScoringRules): ScoredPlayer {
  const projection = player.props ? project(player.props, rules) : null;

  return {
    player,
    projection,
    uncertainty: player.props ? uncertaintyFor(player.props, projection, rules) : null,
  };
}

/**
 * The gap between a player entering the lineup and the one leaving it, or null when we cannot
 * honestly state one.
 *
 * Two reasons for null. Either side may be unpriced, and a difference taken against a missing
 * number reads as a gain when it is only absent data. And the server pairs additions to removals
 * by rank - a presentation choice rather than a decision it made - so when a lineup rearranges,
 * the pair can project worse than what it "replaced". This side has the fuller projection,
 * including baselines for markets the books never posted, so it is the one that can tell. A
 * pairing its own numbers contradict is dropped rather than shown as a negative upgrade.
 */
function gapBetween(entering: ScoredPlayer | null, leaving: ScoredPlayer | null): number | null {
  if (!entering?.projection || !leaving?.projection) return null;

  const difference = entering.projection.points - leaving.projection.points;

  return difference >= 0 ? difference : null;
}

export function scoreSlots(slots: LineupSlot[], rules: ScoringRules): ScoredSlot[] {
  return slots.map((slot) => {
    const starter = slot.starter ? scorePlayer(slot.starter, rules) : null;
    const paired = slot.replaces ? scorePlayer(slot.replaces, rules) : null;
    const gained = gapBetween(starter, paired);

    // A pairing this side cannot bear out is dropped entirely - including the green row, which
    // would otherwise still claim an upgrade after the words backing it up had been removed.
    const honest = gained !== null || !starter?.projection || !paired?.projection;

    return {
      slot,
      starter,
      candidates: slot.candidates.map((player) => scorePlayer(player, rules)),
      replaces: honest ? paired : null,
      gained,
      upgraded: slot.upgraded && honest,
    };
  });
}

export function scoreBench(bench: LineupPlayer[], rules: ScoringRules): ScoredBenchPlayer[] {
  return bench.map((player) => {
    const scored = scorePlayer(player, rules);
    const paired = player.replacedBy ? scorePlayer(player.replacedBy, rules) : null;

    // Same gap, read from the losing side, so the two rows of one swap always agree.
    const gained = gapBetween(paired, scored);
    const honest = gained !== null || !scored.projection || !paired?.projection;

    return {
      ...scored,
      replacedBy: honest ? paired : null,
      lost: gained === null ? null : -gained,
      benched: player.benched && honest,
    };
  });
}

/**
 * Who a player can be weighed against in the drawer, best first.
 *
 * For a slot, that is everyone else eligible for it - which already spans the bench, since the
 * optimizer considers the whole roster for every slot. For a bench player it is everyone holding a
 * slot they could fill, so a flex-eligible receiver is compared against the flex starters rather
 * than against nobody.
 *
 * Unpriced players are dropped: there is nothing to put in the comparison table for them.
 */
export function alternativesFor(
  scored: ScoredSlot | ScoredBenchPlayer,
  slots: ScoredSlot[],
): ScoredPlayer[] {
  const pool =
    'slot' in scored
      ? scored.candidates
      : slots
          .filter((slot) => scored.player.eligibleSlots.includes(slot.slot.index))
          .map((slot) => slot.starter)
          .filter((starter): starter is ScoredPlayer => starter !== null);

  const seen = new Set<string>();

  return pool
    .filter((candidate) => {
      if (!candidate.player.props || seen.has(candidate.player.sleeperId)) return false;
      seen.add(candidate.player.sleeperId);

      return true;
    })
    .sort((a, b) => (b.projection?.points ?? 0) - (a.projection?.points ?? 0));
}

/** Ids in the optimal lineup, so a row can say which side of it a player is on. */
export function startingIds(slots: ScoredSlot[]): Set<string> {
  return new Set(
    slots
      .map((slot) => slot.starter?.player.sleeperId)
      .filter((id): id is string => id !== undefined),
  );
}

/** Points the whole lineup gains over the one currently set. */
export function totalGained(slots: ScoredSlot[]): number {
  return slots.reduce((sum, slot) => sum + (slot.gained ?? 0), 0);
}

/** The lineup's projected total, counting only slots with a priced player. */
export function lineupTotal(slots: ScoredSlot[]): number {
  return slots.reduce((sum, slot) => sum + (slot.starter?.projection?.points ?? 0), 0);
}

/** Sleeper's total over the same lineup, for contrast. Null when it has nothing to say. */
export function sleeperTotal(slots: ScoredSlot[]): number | null {
  const points = slots
    .map((slot) => slot.starter?.player.sleeperPoints)
    .filter((value): value is number => value != null);

  return points.length === 0 ? null : points.reduce((sum, value) => sum + value, 0);
}
