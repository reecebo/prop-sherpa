/**
 * American odds are strings like "+150" or "-110". To compare them we convert to implied
 * probability: the lower the probability, the better the payout for the bettor.
 */
export function impliedProbability(price: string | null): number | null {
  if (!price) return null;

  const value = Number(price);
  if (!Number.isFinite(value) || value === 0) return null;

  return value > 0 ? 100 / (value + 100) : -value / (-value + 100);
}

/**
 * Picks the best price to BET among book quotes - the longest payout on the most generous
 * line. This answers "where would I place this bet", which is a different question from
 * "who should I start": a long payout means the books think the outcome is LESS likely.
 *
 * Start/sit decisions use the fair (de-vigged) number instead. Per-book prices carry each
 * book's own vig, and measured across this data the spread between books (2.2 pts median)
 * barely exceeds the vig itself (1.7 pts), so a single book's short price is mostly juice
 * rather than genuine confidence.
 */
export function bestQuoteIndexes(books: { line: string | null; price: string | null }[]): Set<number> {
  const best = new Set<number>();
  if (books.length === 0) return best;

  // Prefer the most generous line first (higher for an over), then the best price on it.
  const lines = books
    .map((b) => (b.line === null ? null : Number(b.line)))
    .filter((l): l is number => l !== null && Number.isFinite(l));

  const targetLine = lines.length > 0 ? Math.max(...lines) : null;

  let bestProbability = Infinity;

  books.forEach((book, index) => {
    if (targetLine !== null && Number(book.line) !== targetLine) return;

    const probability = impliedProbability(book.price);
    if (probability === null) return;

    if (probability < bestProbability - 1e-9) {
      bestProbability = probability;
      best.clear();
      best.add(index);
    } else if (Math.abs(probability - bestProbability) < 1e-9) {
      best.add(index);
    }
  });

  return best;
}

export function formatKickoff(iso: string | null): string {
  if (!iso) return '';

  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * The short code for a team id, e.g. "MINNESOTA_VIKINGS_NFL" to "MIN".
 *
 * Nicknames are not unique enough to derive a code from ("Giants" and "Jets" both sit in New York),
 * so this is a table. It mirrors NflTeamCodes on the API, which does the same job for matching.
 */
const TEAM_CODES: Record<string, string> = {
  ARIZONA_CARDINALS_NFL: 'ARI',
  ATLANTA_FALCONS_NFL: 'ATL',
  BALTIMORE_RAVENS_NFL: 'BAL',
  BUFFALO_BILLS_NFL: 'BUF',
  CAROLINA_PANTHERS_NFL: 'CAR',
  CHICAGO_BEARS_NFL: 'CHI',
  CINCINNATI_BENGALS_NFL: 'CIN',
  CLEVELAND_BROWNS_NFL: 'CLE',
  DALLAS_COWBOYS_NFL: 'DAL',
  DENVER_BRONCOS_NFL: 'DEN',
  DETROIT_LIONS_NFL: 'DET',
  GREEN_BAY_PACKERS_NFL: 'GB',
  HOUSTON_TEXANS_NFL: 'HOU',
  INDIANAPOLIS_COLTS_NFL: 'IND',
  JACKSONVILLE_JAGUARS_NFL: 'JAX',
  KANSAS_CITY_CHIEFS_NFL: 'KC',
  LAS_VEGAS_RAIDERS_NFL: 'LV',
  LOS_ANGELES_CHARGERS_NFL: 'LAC',
  LOS_ANGELES_RAMS_NFL: 'LAR',
  MIAMI_DOLPHINS_NFL: 'MIA',
  MINNESOTA_VIKINGS_NFL: 'MIN',
  NEW_ENGLAND_PATRIOTS_NFL: 'NE',
  NEW_ORLEANS_SAINTS_NFL: 'NO',
  NEW_YORK_GIANTS_NFL: 'NYG',
  NEW_YORK_JETS_NFL: 'NYJ',
  PHILADELPHIA_EAGLES_NFL: 'PHI',
  PITTSBURGH_STEELERS_NFL: 'PIT',
  SAN_FRANCISCO_49ERS_NFL: 'SF',
  SEATTLE_SEAHAWKS_NFL: 'SEA',
  TAMPA_BAY_BUCCANEERS_NFL: 'TB',
  TENNESSEE_TITANS_NFL: 'TEN',
  WASHINGTON_COMMANDERS_NFL: 'WAS',
};

export function teamCode(teamId: string | null): string {
  if (!teamId) return '';
  return TEAM_CODES[teamId] ?? teamId.replace(/_NFL$/, '');
}

/** Team ids arrive as "MINNESOTA_VIKINGS_NFL"; show the readable tail. */
export function formatTeam(teamId: string): string {
  return teamId
    .replace(/_NFL$/, '')
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

export function formatRelative(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}
