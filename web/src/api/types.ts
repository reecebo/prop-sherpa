export interface BookQuote {
  book: string;
  /** Books disagree on the line as well as the price, so the two must be read together. */
  line: string | null;
  price: string | null;
  lastUpdated: string | null;
  deeplink: string | null;
}

export interface PropLine {
  statId: string;
  market: string;
  side: string;
  /** The provider's de-vigged consensus. Present even when per-book odds are withheld. */
  consensusLine: string | null;
  consensusPrice: string | null;
  openPrice: string | null;
  books: BookQuote[];
}

export interface PlayerProps {
  playerId: string;
  name: string;
  /** QB, RB, WR, TE - drives which markets are shown. */
  position: string | null;
  team: string;
  opponent: string;
  eventId: string;
  kickoff: string | null;
  lines: PropLine[];
}

export interface PlayerSearchResult {
  playerId: string;
  name: string;
  position: string | null;
  team: string;
  opponent: string;
  kickoff: string | null;
}

export interface CompareResponse {
  retrievedAt: string;
  books: string[];
  players: PlayerProps[];
  missing: string[];
}

export interface CacheStatus {
  cached: boolean;
  retrievedAt?: string;
  eventCount?: number;
  players?: number;
  books?: string[];
}

/** Why a rostered player has no odds. Matches UnmatchedReasons on the API. */
export type UnmatchedReason = 'no-props' | 'not-in-directory' | 'ambiguous';

export interface LineupPlayer {
  sleeperId: string;
  name: string;
  position: string | null;
  team: string | null;
  injuryStatus: string | null;
  /** Null whenever the books have not priced this player - common, not an error. */
  props: PlayerProps | null;
  unmatched: UnmatchedReason | null;
  /** Sleeper's own projection for the week, for contrast with the market-derived one. */
  sleeperPoints: number | null;
  /** True when this bench player is starting in Sleeper but not in the optimal lineup. */
  benched: boolean;
  /** The player who takes their place. The mirror of a slot's `replaces`. */
  replacedBy: LineupPlayer | null;
  /** Lineup slot indices this player could legally fill. Sent so slot rules stay server-side. */
  eligibleSlots: number[];
}

export interface LineupSlot {
  /** Slots repeat (RB, RB, FLEX...), so the index is the identity, not the name. */
  index: number;
  slot: string;
  label: string;
  /** The best player available for this slot. */
  starter: LineupPlayer | null;
  /** Everyone else eligible here, best first. */
  candidates: LineupPlayer[];
  /** True when this player is not in the lineup currently set in Sleeper. */
  upgraded: boolean;
  /** The benched player they displace, when the swap pairs to one. */
  replaces: LineupPlayer | null;
}

export interface LineupTeamSummary {
  rosterId: number;
  teamName: string;
  manager: string;
}

export interface LineupTeam extends LineupTeamSummary {
  slots: LineupSlot[];
  bench: LineupPlayer[];
  reserve: LineupPlayer[];
  taxi: LineupPlayer[];
}

/**
 * The league's own scoring, as points per unit. Sent as numbers rather than a PPR/half/standard
 * label because that label only captures receptions.
 */
export interface LeagueScoring {
  passYd: number;
  passTd: number;
  rushYd: number;
  recYd: number;
  rec: number;
  rushTd: number;
  recTd: number;
  bonusRecTe: number | null;
}

export interface LineupLeague {
  leagueId: string;
  name: string;
  season: string;
  week: number;
  scoring: LeagueScoring;
  startingSlots: string[];
  teams: LineupTeamSummary[];
}

export interface LineupResponse {
  league: LineupLeague;
  team: LineupTeam;
  propsRetrievedAt: string;
  rostersRetrievedAt: string;
  playersRetrievedAt: string | null;
  books: string[];
  unmatchedStarters: number;
}

export interface LeagueRefreshResult {
  retrievedAt: string;
  week: number;
  league: string;
  teams: number;
}

export interface PlayersRefreshResult {
  players: number;
  downloadedAt: string | null;
}
