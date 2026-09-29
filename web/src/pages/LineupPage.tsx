import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { formatRelative } from '../api/odds';
import {
  lineupTotal,
  rulesFrom,
  scoreBench,
  scoreSlots,
  sleeperTotal,
  totalGained,
} from '../api/lineup';
import { formatPoints } from '../api/projection';
import type { LineupResponse } from '../api/types';
import { LeagueBar } from '../components/LeagueBar';
import { LineupTable } from '../components/LineupTable';
import { BenchedIcon, BetterStartIcon, ICON_SIZE } from '../components/icons';

/** Remembers the league so the page is useful on the second visit without retyping the id. */
const LEAGUE_STORAGE_KEY = 'propsherpa.leagueId';

function storedLeagueId(): string {
  try {
    return localStorage.getItem(LEAGUE_STORAGE_KEY) ?? '';
  } catch {
    // Private windows and blocked site data both throw here; an empty input is a fine fallback.
    return '';
  }
}

export default function LineupPage() {
  const [leagueId, setLeagueId] = useState(storedLeagueId);
  const [rosterId, setRosterId] = useState<number | null>(null);
  const [data, setData] = useState<LineupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState<'rosters' | 'players' | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const load = useCallback(
    (id: string, roster: number | null, signal?: AbortSignal) => {
      if (!id) return;

      setLoading(true);

      api
        .lineup(id, roster ?? undefined, signal)
        .then((response) => {
          if (signal?.aborted) return;
          setData(response);
          setRosterId(response.team.rosterId);
          setError(null);
        })
        .catch((err: Error) => {
          if (signal?.aborted) return;
          setError(err.message);
          setData(null);
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        });
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(leagueId, rosterId, controller.signal);

    return () => controller.abort();
    // rosterId is deliberately not a dependency: selecting a team calls load directly, and
    // including it here would refetch when the response reports back which roster it returned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, load]);

  function changeLeague(id: string) {
    try {
      localStorage.setItem(LEAGUE_STORAGE_KEY, id);
    } catch {
      // Not being able to remember it is not a reason to refuse to load it.
    }

    setOpenRow(null);
    setRosterId(null);
    setLeagueId(id);
  }

  function changeRoster(id: number) {
    setOpenRow(null);
    setRosterId(id);
    load(leagueId, id);
  }

  async function refresh(kind: 'rosters' | 'players') {
    setRefreshing(kind);
    setError(null);

    try {
      await (kind === 'rosters' ? api.refreshLeague(leagueId) : api.refreshPlayers());
      load(leagueId, rosterId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefreshing(null);
    }
  }

  /**
   * Scoring comes from the league rather than a picker: the response carries the real rules, so a
   * toggle here could only produce numbers that do not match the league.
   */
  const rules = useMemo(() => (data ? rulesFrom(data.league.scoring) : null), [data]);

  const slots = useMemo(
    () => (data && rules ? scoreSlots(data.team.slots, rules) : []),
    [data, rules],
  );

  const bench = useMemo(
    () => (data && rules ? scoreBench(data.team.bench, rules) : []),
    [data, rules],
  );

  const ourTotal = lineupTotal(slots);
  const theirTotal = sleeperTotal(slots);
  const changes = slots.filter((slot) => slot.upgraded);
  const gain = totalGained(slots);

  return (
    <>
      <header className="header">
        <div>
          <h1>Lineup optimizer</h1>
          <p className="tagline">Check a Sleeper roster against the books, slot by slot.</p>
        </div>

        {data && (
          <div className="cache">
            <span className="cache-meta">Odds {formatRelative(data.propsRetrievedAt)}</span>
            <button
              type="button"
              className="refresh"
              onClick={async () => {
                setRefreshing('rosters');
                try {
                  await api.refresh();
                  load(leagueId, rosterId);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setRefreshing(null);
                }
              }}
              disabled={refreshing !== null}
            >
              Refresh odds
            </button>
          </div>
        )}
      </header>

      <LeagueBar
        /* Remounts when the league changes, so the input starts from the new id rather than
           being synced back into state by an effect. */
        key={leagueId}
        leagueId={leagueId}
        onLeagueIdChange={changeLeague}
        data={data}
        rosterId={rosterId}
        onRosterChange={changeRoster}
        onRefreshRosters={() => refresh('rosters')}
        onRefreshPlayers={() => refresh('players')}
        refreshing={refreshing}
      />

      {error && <p className="error">{error}</p>}

      {!error && !data && !loading && !leagueId && (
        <p className="lineup-hint">
          Enter a Sleeper league ID above to pull in its rosters. You can find it in the league&apos;s
          URL on sleeper.com.
        </p>
      )}

      {data && rules && (
        <>
          <section className="lineup-summary">
            <div className="lineup-total">
              <span className="lineup-total-value">{formatPoints(ourTotal)}</span>
              <span className="lineup-total-label">projected from the books</span>
            </div>

            {theirTotal !== null && (
              <div className="lineup-total lineup-total-alt">
                <span className="lineup-total-value">{formatPoints(theirTotal)}</span>
                <span className="lineup-total-label">Sleeper&apos;s projection</span>
              </div>
            )}

            {changes.length > 0 && gain > 0 && (
              <div className="lineup-total lineup-total-gain">
                <span className="lineup-total-value">+{formatPoints(gain)}</span>
                <span className="lineup-total-label">
                  from {changes.length} {changes.length === 1 ? 'change' : 'changes'}
                </span>
              </div>
            )}

            {data.unmatchedStarters > 0 && (
              <p className="lineup-caveat">
                {data.unmatchedStarters} of {data.team.slots.length} slots have no posted line.
              </p>
            )}
          </section>

          <LineupTable
            slots={slots}
            bench={bench}
            books={data.books}
            scoring={rules}
            openRow={openRow}
            onToggleRow={setOpenRow}
          />

          <div className="legend">
            <p>
              This is the <strong className="legend-win">best lineup available</strong> from the
              roster, not the one currently set in Sleeper. Rows marked{' '}
              <BetterStartIcon size={ICON_SIZE.inline} aria-hidden="true" /> move into the lineup;
              the bench rows marked{' '}
              <BenchedIcon size={ICON_SIZE.inline} aria-hidden="true" /> are the players they move
              out. Each names its counterpart and the points between them.
            </p>
            <p>
              <strong className="legend-range">Ours</strong> comes from sportsbook prop lines with
              the books&apos; margin removed. <strong className="legend-bet">Sleeper</strong> is
              their vendor&apos;s number, shown for contrast. They disagree often, and the gap is
              usually the interesting part.
            </p>
            <p>
              Open any row for the markets behind its projection, and to compare against anyone
              eligible for the same slot - bench included.
            </p>
          </div>
        </>
      )}
    </>
  );
}
