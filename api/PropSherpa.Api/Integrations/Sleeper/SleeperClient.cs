using System.Net.Http.Json;
using System.Text.Json;

namespace PropSherpa.Api.Integrations.Sleeper;

/// <summary>
/// Sleeper's public API. No auth: every endpoint here is read-only and unauthenticated.
/// </summary>
public class SleeperClient : ISleeperClient
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
    };

    private readonly HttpClient _httpClient;
    private readonly ILogger<SleeperClient> _logger;

    public SleeperClient(HttpClient httpClient, ILogger<SleeperClient> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public Task<SleeperLeague> GetLeagueAsync(string leagueId, CancellationToken ct = default) =>
        GetAsync<SleeperLeague>($"league/{leagueId}", ct);

    public async Task<IReadOnlyList<SleeperUser>> GetUsersAsync(string leagueId, CancellationToken ct = default) =>
        await GetAsync<List<SleeperUser>>($"league/{leagueId}/users", ct);

    public async Task<IReadOnlyList<SleeperRoster>> GetRostersAsync(string leagueId, CancellationToken ct = default) =>
        await GetAsync<List<SleeperRoster>>($"league/{leagueId}/rosters", ct);

    public Task<SleeperState> GetStateAsync(CancellationToken ct = default) =>
        GetAsync<SleeperState>("state/nfl", ct);

    public async Task<IReadOnlyDictionary<string, SleeperPlayer>> GetPlayersAsync(CancellationToken ct = default)
    {
        _logger.LogInformation("Downloading the Sleeper player directory (~15 MB).");

        var players = await GetAsync<Dictionary<string, SleeperPlayer>>("players/nfl", ct);

        _logger.LogInformation("Downloaded {Count} players.", players.Count);

        return players;
    }

    private async Task<T> GetAsync<T>(string path, CancellationToken ct)
    {
        using var response = await _httpClient.GetAsync(path, ct);
        response.EnsureSuccessStatusCode();

        return await response.Content.ReadFromJsonAsync<T>(SerializerOptions, ct)
               ?? throw new InvalidOperationException($"Sleeper returned an empty body for '{path}'.");
    }
}
