import { useState } from "react";
import { formatRelative } from "../api/odds";
import type { LineupResponse } from "../api/types";

interface Props {
  leagueId: string;
  onLeagueIdChange: (leagueId: string) => void;
  data: LineupResponse | null;
  rosterId: number | null;
  onRosterChange: (rosterId: number) => void;
  onRefreshRosters: () => void;
  onRefreshPlayers: () => void;
  refreshing: "rosters" | "players" | null;
}

/** e.g. "0.5 PPR · 4pt pass TD". Doubles as confirmation the right league loaded. */
function describeScoring(data: LineupResponse): string {
  const { rec, passTd, bonusRecTe } = data.league.scoring;

  const reception =
    rec === 1 ? "Full PPR" : rec === 0 ? "Standard" : `${rec} PPR`;
  const parts = [reception, `${passTd}pt pass TD`];

  if (bonusRecTe) parts.push(`+${bonusRecTe} TE`);

  return parts.join(" · ");
}

export function LeagueBar({
  leagueId,
  onLeagueIdChange,
  data,
  rosterId,
  onRosterChange,
  onRefreshRosters,
  onRefreshPlayers,
  refreshing,
}: Readonly<Props>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(leagueId);

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = draft.trim();
    if (trimmed) onLeagueIdChange(trimmed);

    setEditing(false);
  }

  return (
    <section className="league-bar">
      <div className="league-id-block">
        {editing || !data ? (
          <form className="league-form" onSubmit={submit}>
            <label className="league-label" htmlFor="league-id">
              Sleeper league ID
            </label>
            <div className="league-input-row">
              <input
                id="league-id"
                className="league-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="e.g. 1314676099656990720"
                inputMode="numeric"
              />
              <button type="submit">Load</button>
            </div>
          </form>
        ) : (
          <div className="league-id-summary">
            <h2 className="league-name">{data.league.name}</h2>
            <p className="league-meta">
              {data.league.season} · Week {data.league.week} ·{" "}
              {describeScoring(data)}
            </p>
            <button
              type="button"
              className="league-change"
              onClick={() => setEditing(true)}
            >
              Change league
            </button>
          </div>
        )}
      </div>

      {data && (
        <div className="league-controls">
          <label className="league-label" htmlFor="team-select">
            Team
          </label>
          <select
            id="team-select"
            className="team-select"
            value={rosterId ?? data.team.rosterId}
            onChange={(event) => onRosterChange(Number(event.target.value))}
          >
            {data.league.teams.map((team) => (
              <option key={team.rosterId} value={team.rosterId}>
                {team.teamName} · {team.manager}
              </option>
            ))}
          </select>

          <div className="league-refresh">
            {/* Rosters are what go stale in normal use, so this is the prominent one. */}
            <button
              type="button"
              onClick={onRefreshRosters}
              disabled={refreshing !== null}
            >
              {refreshing === "rosters" ? "Syncing..." : "Sync Rosters"}
            </button>
            <span className="league-age">
              Rosters {formatRelative(data.rostersRetrievedAt)}
            </span>

            {/* 15 MB, and only needed for a just-signed player, so it stays quiet. */}
            <button
              type="button"
              className="league-secondary"
              onClick={onRefreshPlayers}
              disabled={refreshing !== null}
              title="Re-downloads Sleeper's full player list. Only needed when a new signing is missing."
            >
              {refreshing === "players" ? "Updating…" : "Update player list"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
