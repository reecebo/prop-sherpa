using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace PropSherpa.Api.Integrations.Sleeper;

/// <summary>
/// League settings, managers and rosters, cached per league.
///
/// This is the volatile half of Sleeper - rosters change on every waiver claim, trade and lineup
/// edit - but reads still never hit the network, so the page is never waiting on Sleeper and the
/// user decides when to pull. That is what the refresh button is for.
///
/// Keyed by league id so importing a second league does not evict the first.
/// </summary>
public class SleeperLeagueCache
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    private readonly ISleeperClient _client;
    private readonly SleeperOptions _options;
    private readonly ILogger<SleeperLeagueCache> _logger;
    private readonly string _cacheDirectory;
    private readonly ConcurrentDictionary<string, SleeperLeagueSnapshot> _snapshots = new();
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new();

    public SleeperLeagueCache(
        ISleeperClient client,
        IOptions<SleeperOptions> options,
        IHostEnvironment environment,
        ILogger<SleeperLeagueCache> logger)
    {
        _client = client;
        _options = options.Value;
        _logger = logger;

        _cacheDirectory = Path.IsPathRooted(_options.LeagueCacheDirectory)
            ? _options.LeagueCacheDirectory
            : Path.Combine(environment.ContentRootPath, _options.LeagueCacheDirectory);
    }

    /// <summary>
    /// The cached snapshot, loading from disk and falling back to a first fetch. Unlike the player
    /// directory this never expires on its own - rosters go stale in ways only the user can judge.
    /// </summary>
    public async Task<SleeperLeagueSnapshot> GetAsync(string leagueId, CancellationToken ct = default)
    {
        if (_snapshots.TryGetValue(leagueId, out var cached)) return cached;

        var gate = _locks.GetOrAdd(leagueId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            if (_snapshots.TryGetValue(leagueId, out cached)) return cached;

            var fromDisk = await LoadFromDiskAsync(leagueId, ct);
            if (fromDisk is not null) return _snapshots[leagueId] = fromDisk;

            return _snapshots[leagueId] = await FetchAsync(leagueId, ct);
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Re-pulls the league from Sleeper. What the refresh button calls.</summary>
    public async Task<SleeperLeagueSnapshot> RefreshAsync(string leagueId, CancellationToken ct = default)
    {
        var gate = _locks.GetOrAdd(leagueId, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            return _snapshots[leagueId] = await FetchAsync(leagueId, ct);
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task<SleeperLeagueSnapshot> FetchAsync(string leagueId, CancellationToken ct)
    {
        // Four independent calls of a few KB each; running them together costs one round trip.
        var league = _client.GetLeagueAsync(leagueId, ct);
        var users = _client.GetUsersAsync(leagueId, ct);
        var rosters = _client.GetRostersAsync(leagueId, ct);
        var state = _client.GetStateAsync(ct);

        await Task.WhenAll(league, users, rosters, state);

        var snapshot = new SleeperLeagueSnapshot(
            DateTimeOffset.UtcNow,
            state.Result.Week,
            league.Result,
            users.Result,
            rosters.Result);

        await SaveToDiskAsync(leagueId, snapshot, ct);

        _logger.LogInformation(
            "Pulled league {League}: {Teams} teams, week {Week}.",
            snapshot.League.Name, snapshot.Rosters.Count, snapshot.Week);

        return snapshot;
    }

    private string PathFor(string leagueId) =>
        Path.Combine(_cacheDirectory, $"sleeper-league-{leagueId}.json");

    private async Task<SleeperLeagueSnapshot?> LoadFromDiskAsync(string leagueId, CancellationToken ct)
    {
        var path = PathFor(leagueId);
        if (!File.Exists(path)) return null;

        try
        {
            await using var stream = File.OpenRead(path);
            return await JsonSerializer.DeserializeAsync<SleeperLeagueSnapshot>(stream, SerializerOptions, ct);
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            _logger.LogWarning(ex, "Could not read the league cache at {Path}; re-fetching.", path);
            return null;
        }
    }

    private async Task SaveToDiskAsync(string leagueId, SleeperLeagueSnapshot snapshot, CancellationToken ct)
    {
        Directory.CreateDirectory(_cacheDirectory);

        var path = PathFor(leagueId);
        var temporaryPath = path + ".tmp";

        await using (var stream = File.Create(temporaryPath))
        {
            await JsonSerializer.SerializeAsync(stream, snapshot, SerializerOptions, ct);
        }

        File.Move(temporaryPath, path, overwrite: true);
    }
}
