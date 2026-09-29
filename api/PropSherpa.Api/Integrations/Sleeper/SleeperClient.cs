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

    public async Task<IReadOnlyDictionary<string, SleeperProjection>> GetProjectionsAsync(
        string season,
        int week,
        CancellationToken ct = default)
    {
        // Projections sit on a different host from the documented v1 API, with no /v1 prefix.
        var url = $"https://api.sleeper.com/projections/nfl/{season}/{week}?season_type=regular";

        using var response = await _httpClient.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

        var projections = new Dictionary<string, SleeperProjection>(StringComparer.Ordinal);

        foreach (var element in document.RootElement.EnumerateArray())
        {
            if (element.GetProperty("player_id").GetString() is not { } playerId) continue;
            if (!element.TryGetProperty("stats", out var stats)) continue;

            var projection = new SleeperProjection(
                Number(stats, "pts_ppr"),
                Number(stats, "pts_half_ppr"),
                Number(stats, "pts_std"));

            // Most records are inactive players carrying no projection at all.
            if (projection is { Ppr: null, HalfPpr: null, Standard: null }) continue;

            projections[playerId] = projection;
        }

        return projections;
    }

    private static double? Number(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number
            ? value.GetDouble()
            : null;

    private async Task<T> GetAsync<T>(string path, CancellationToken ct)
    {
        using var response = await _httpClient.GetAsync(path, ct);
        response.EnsureSuccessStatusCode();

        return await response.Content.ReadFromJsonAsync<T>(SerializerOptions, ct)
               ?? throw new InvalidOperationException($"Sleeper returned an empty body for '{path}'.");
    }
}
