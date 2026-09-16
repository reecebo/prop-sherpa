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
