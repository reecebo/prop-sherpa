import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { PlayerSearchResult } from '../api/types';
import { formatTeam } from '../api/odds';

interface Props {
  onAdd: (player: PlayerSearchResult) => void;
  disabledIds: string[];
  placeholder?: string;
}

export function PlayerSearch({ onAdd, disabledIds, placeholder }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    // Debounce so typing does not fire a request per keystroke.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .search(query, controller.signal)
        .then((found) => {
          setResults(found);
          setOpen(true);
        })
        .catch(() => undefined);
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function onClickAway(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  function add(player: PlayerSearchResult) {
    onAdd(player);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="search" ref={containerRef}>
      <input
        type="search"
        value={query}
        placeholder={placeholder ?? 'Add a player to compare…'}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />

      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map((player) => {
            const alreadyAdded = disabledIds.includes(player.playerId);

            return (
              <li key={player.playerId}>
                <button type="button" disabled={alreadyAdded} onClick={() => add(player)}>
                  <span className="search-name">
                    {player.name}
                    {player.position && <span className="pos-chip" data-pos={player.position}>{player.position}</span>}
                  </span>
                  <span className="search-meta">
                    {formatTeam(player.team)} vs {formatTeam(player.opponent)}
                    {alreadyAdded && ' · added'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
