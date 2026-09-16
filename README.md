# PropSherpa

Compare NFL player props across sportsbooks to decide who to start.

## Running it

Two terminals:

```bash
# API - http://localhost:5114
cd api/PropSherpa.Api && dotnet run

# Web - http://localhost:5173
cd web && npm install && npm run dev
```

Open http://localhost:5173, click **Refresh odds** once to populate the cache, then search
for players to compare.

## How data flows

Odds come from the [SportsGameOdds](https://sportsgameodds.com) v2 API. **Every event pulled
costs one entity against a capped monthly quota**, so nothing fetches live: a refresh writes a
normalized snapshot to `api/PropSherpa.Api/Cache/props-cache.json`, and every read serves from
it. The cache survives restarts so a rebuild costs nothing.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/props/refresh` | Pull fresh odds. Spends quota. |
| `GET /api/props/status` | What is cached, and when it was pulled. |
| `GET /api/props/search?query=` | Find players in the cache. |
| `GET /api/props/compare?players=id1,id2` | Side-by-side props. |

## Markets tracked

| Position | Markets |
| --- | --- |
| QB | Passing yards, passing TDs, rushing yards, rushing TDs |
| RB | Rushing yards, receiving yards, receptions, anytime TD |
| WR/TE | Receiving yards, receptions, anytime TD |

Markets are keyed by the provider's `statID` in [`PropMarkets.cs`](api/PropSherpa.Api/Features/Props/PropMarkets.cs) —
the single place to change if the provider renames one.

## API tier

The account is on the **amateur** tier, which withholds per-book odds for many props: responses
carry a notice like *"missing 27,633 bookmaker odds."* Anytime TD usually has five books;
yardage markets often have one or none. The consensus ("fair") column is always populated, so
the UI leads with it and fills in books where they exist.

Reads as "No book odds on this plan" in a cell where the provider sent none.

## Configuration

`appsettings.Development.json` under `SportsGameOdds`:

- `ApiKey` — move to user secrets before sharing this repo: `dotnet user-secrets set "SportsGameOdds:ApiKey" "<key>"`
- `MaxEventsPerRefresh` — events per refresh, default 20. Each one costs an entity.
- `CachePath` — snapshot location, relative to the content root.
