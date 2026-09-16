namespace PropSherpa.Api.Integrations.Sleeper;

public interface ISleeperClient
{
    Task<SleeperLeague> GetLeagueAsync(string leagueId, CancellationToken ct = default);

    Task<IReadOnlyList<SleeperUser>> GetUsersAsync(string leagueId, CancellationToken ct = default);

    Task<IReadOnlyList<SleeperRoster>> GetRostersAsync(string leagueId, CancellationToken ct = default);

    Task<SleeperState> GetStateAsync(CancellationToken ct = default);

    /// <summary>
    /// The full player directory - 15 MB and roughly 12,000 players. Sleeper asks for at most one
    /// call a day, so only <see cref="SleeperPlayerDirectory"/> should call this.
    /// </summary>
    Task<IReadOnlyDictionary<string, SleeperPlayer>> GetPlayersAsync(CancellationToken ct = default);
}
