using PropSherpa.Api.Features.Props;

namespace PropSherpa.Api.Integrations.SportsGameOdds;

public interface ISportsGameOddsClient
{
    Task<string> GetSampleSportsJsonAsync(CancellationToken ct = default);

    /// <summary>
    /// Pulls upcoming events with odds attached and flattens them into player-centric rows.
    /// Each event costs one entity against the monthly quota, so callers should cache the result.
    /// </summary>
    Task<PropSnapshot> FetchSnapshotAsync(int maxEvents, CancellationToken ct = default);

    /// <summary>
    /// Looks up positions for specific players. Costs one entity per player, so callers should
    /// ask only for players whose position is not already cached.
    /// </summary>
    Task<IReadOnlyDictionary<string, string>> FetchPositionsAsync(
        IReadOnlyList<string> playerIds, CancellationToken ct = default);
}
