import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api/client';
import type { CacheStatus, CompareResponse, PlayerSearchResult } from './api/types';
import { formatRelative } from './api/odds';
import { edgeFor } from './api/edge';
import type { MarketEdge } from './api/edge';
import { PlayerSearch } from './components/PlayerSearch';
import { PlayerPanel } from './components/PlayerPanel';
import { Verdict } from './components/Verdict';
import { coverage, project } from './api/projection';
import type { Scoring } from './api/projection';
import { meaningfulGap, uncertaintyFor } from './api/uncertainty';
import './App.css';

/** Two sides, each independently searched. */
type Slots = [PlayerSearchResult | null, PlayerSearchResult | null];

export default function App() {
  const [slots, setSlots] = useState<Slots>([null, null]);
  const [data, setData] = useState<CompareResponse | null>(null);
  const [status, setStatus] = useState<CacheStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Scoring format changes the answer, so it is a first-class control rather than a setting.
  const [scoring, setScoring] = useState<Scoring>('ppr');

  useEffect(() => {
    api.status().then(setStatus).catch(() => undefined);
  }, []);

  const ids = slots.filter((slot): slot is PlayerSearchResult => slot !== null).map((s) => s.playerId);
  const idKey = ids.join(',');

  useEffect(() => {
    if (ids.length === 0) {
      setData(null);
      return;
    }

    let cancelled = false;

    api
      .compare(ids)
      .then((response) => !cancelled && (setData(response), setError(null)))
      .catch((err: Error) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);

    try {
      setStatus(await api.refresh());
      if (ids.length > 0) setData(await api.compare(ids));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  // Keep the API's players in slot order, so the left panel is always slot 0.
  const ordered = useMemo(
    () =>
      slots.map((slot) =>
        slot ? data?.players.find((p) => p.playerId === slot.playerId) ?? null : null,
      ),
    [slots, data],
  );

  /** Edges are computed once across both slots, then read by each panel. */
  const edges = useMemo(() => {
    const result = new Map<string, MarketEdge>();
    if (!ordered[0] || !ordered[1]) return result;

    const statIds = new Set([
      ...ordered[0].lines.map((line) => line.statId),
      ...ordered[1].lines.map((line) => line.statId),
    ]);

    for (const statId of statIds) {
      result.set(
        statId,
        edgeFor(ordered.map((player) => player?.lines.find((line) => line.statId === statId))),
      );
    }

    return result;
  }, [ordered]);

  /**
   * Which side the start/sit call favours, or null when there is no call to make. The verdict
   * states it in words; the panels use it to mark the winning card.
   */
  const winner = useMemo(() => {
    const [a, b] = ordered;
    if (!a || !b) return null;

    const projections = [project(a, scoring), project(b, scoring)];
    const [pa, pb] = projections;
    if (!pa || !pb) return null;

    const coverages = [coverage(pa), coverage(pb)];
    const lopsided =
      coverages.some((value) => value < 0.5) && Math.abs(coverages[0] - coverages[1]) >= 0.25;
    if (lopsided) return null;

    const gap = Math.abs(pa.points - pb.points);
    const threshold = meaningfulGap(
      uncertaintyFor(a, pa, scoring),
      uncertaintyFor(b, pb, scoring),
    );
    if (gap < threshold) return null;

    return pa.points >= pb.points ? 0 : 1;
  }, [ordered, scoring]);

  function setSlot(index: 0 | 1, player: PlayerSearchResult | null) {
    setSlots((current) => {
      const next = [...current] as Slots;
      next[index] = player;
      return next;
    });
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>PropSherpa</h1>
          <p className="tagline">Compare player props across books to set your lineup.</p>
        </div>

        <div className="cache">
          {status?.cached ? (
            <span className="cache-meta">
              {status.players} players · {status.eventCount} games ·{' '}
              {status.retrievedAt && formatRelative(status.retrievedAt)}
            </span>
          ) : (
            <span className="cache-meta">No odds cached yet</span>
          )}

          {/* Each refresh spends API quota, so it stays a deliberate click. */}
          <button type="button" className="refresh" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh odds'}
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <Verdict players={ordered} scoring={scoring} onScoringChange={setScoring} />

      <div className="split">
        {([0, 1] as const).map((index) => (
          <div className="side" key={index}>
            <PlayerSearch
              onAdd={(player) => setSlot(index, player)}
              disabledIds={ids}
              placeholder={index === 0 ? 'Search player A…' : 'Search player B…'}
            />

            <PlayerPanel
              player={ordered[index]}
              books={data?.books ?? []}
              edges={edges}
              side={index}
              scoring={scoring}
              wins={winner === index}
              onRemove={() => setSlot(index, null)}
            />
          </div>
        ))}
      </div>

      {/* Comparing across positions is legitimate but worth naming - the market sets differ. */}
      {ordered[0]?.position && ordered[1]?.position && ordered[0].position !== ordered[1].position && (
        <p className="cross-position">
          Comparing <strong>{ordered[0].position}</strong> against{' '}
          <strong>{ordered[1].position}</strong> — only shared markets are scored.
        </p>
      )}

      {edges.size > 0 && (
        <div className="legend">
          <p>
            <strong className="legend-range">Range under each total</strong> — projections are
            medians, not forecasts. The range is roughly one standard deviation either way, and a
            start call is only made when the gap outruns it.
          </p>
          <p>
            <strong className="legend-win">▲ Better start</strong> — compares the de-vigged
            projection: more yards or receptions, or a higher chance to score. This is the
            start/sit signal.
          </p>
          <p>
            <strong className="legend-bet">Outlined price</strong> — the longest payout among
            books, i.e. where you would place the bet. A long payout means the books think it is{' '}
            <em>less</em> likely, so this is not a reason to start someone.
          </p>
          <p>
            <strong className="legend-move">↗ ↘ Movement</strong> — how far the anytime-TD price
            has moved since it opened, in points of probability. Only shown on touchdown markets:
            the provider publishes an opening price but no opening line, so on yardage markets a
            price change reflects vig, not a change of opinion.
          </p>
        </div>
      )}
    </div>
  );
}
