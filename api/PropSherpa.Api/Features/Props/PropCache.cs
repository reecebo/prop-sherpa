using System.Text.Json;
using Microsoft.Extensions.Options;
using PropSherpa.Api.Integrations.SportsGameOdds;

namespace PropSherpa.Api.Features.Props;

/// <summary>
/// Holds the most recent snapshot in memory and mirrors it to disk. Every event pulled costs one
/// entity against a capped monthly quota, so reads never hit the provider - only an explicit
/// refresh does. The disk copy survives restarts, so a rebuild does not cost quota.
/// </summary>
public class PropCache
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    private readonly ISportsGameOddsClient _client;
    private readonly PositionCatalog _positions;
    private readonly SportsGameOddsOptions _options;
    private readonly ILogger<PropCache> _logger;
    private readonly string _cachePath;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);

    private PropSnapshot? _snapshot;

    public PropCache(
        ISportsGameOddsClient client,
        PositionCatalog positions,
        IOptions<SportsGameOddsOptions> options,
        IHostEnvironment environment,
        ILogger<PropCache> logger)
    {
        _client = client;
        _positions = positions;
        _options = options.Value;
        _logger = logger;

        _cachePath = Path.IsPathRooted(_options.CachePath)
            ? _options.CachePath
            : Path.Combine(environment.ContentRootPath, _options.CachePath);
    }

    /// <summary>The cached snapshot, loading from disk on first access. Null until a refresh happens.</summary>
    public async Task<PropSnapshot?> GetAsync(CancellationToken ct = default)
    {
        if (_snapshot is not null) return _snapshot;

        await _refreshLock.WaitAsync(ct);
        try
        {
            if (_snapshot is not null) return _snapshot;
            return _snapshot = await LoadFromDiskAsync(ct);
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    /// <summary>Pulls fresh data from the provider and replaces the cache. Costs quota.</summary>
    public async Task<PropSnapshot> RefreshAsync(CancellationToken ct = default)
    {
        await _refreshLock.WaitAsync(ct);
        try
        {
            var snapshot = await _client.FetchSnapshotAsync(_options.MaxEventsPerRefresh, ct);
            snapshot = await ApplyPositionsAsync(snapshot, ct);
            _snapshot = snapshot;

            await SaveToDiskAsync(snapshot, ct);

            _logger.LogInformation(
                "Refreshed props: {Events} events, {Players} players, {Books} books.",
                snapshot.EventCount, snapshot.Players.Count, snapshot.Books.Count);

            return snapshot;
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    /// <summary>
    /// Attaches positions and expands each player to the full market set for their position, so a
    /// market with no posted line still shows as a row rather than silently disappearing.
    /// </summary>
    private async Task<PropSnapshot> ApplyPositionsAsync(PropSnapshot snapshot, CancellationToken ct)
    {
        var missing = await _positions.MissingAsync(snapshot.Players.Select(p => p.PlayerId), ct);

        if (missing.Count > 0)
        {
            _logger.LogInformation("Looking up {Count} unknown player positions.", missing.Count);
            await _positions.MergeAsync(await _client.FetchPositionsAsync(missing, ct), ct);
        }

        var known = await _positions.GetAsync(ct);

        var players = snapshot.Players.Select(player =>
        {
            var position = known.GetValueOrDefault(player.PlayerId);

            var lines = PropMarkets.ForPosition(position)
                .Select(statId => player.Lines.FirstOrDefault(line => line.StatId == statId)
                                  ?? PropLine.Absent(statId))
                .ToList();

            return player with { Position = position, Lines = lines };
        }).ToList();

        return snapshot with { Players = players };
    }

    private async Task<PropSnapshot?> LoadFromDiskAsync(CancellationToken ct)
    {
        if (!File.Exists(_cachePath)) return null;

        try
        {
            await using var stream = File.OpenRead(_cachePath);
            return await JsonSerializer.DeserializeAsync<PropSnapshot>(stream, SerializerOptions, ct);
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            // A corrupt cache should not take the app down - a refresh will replace it.
            _logger.LogWarning(ex, "Could not read cache at {Path}; a refresh is needed.", _cachePath);
            return null;
        }
    }

    private async Task SaveToDiskAsync(PropSnapshot snapshot, CancellationToken ct)
    {
        var directory = Path.GetDirectoryName(_cachePath);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);

        await using var stream = File.Create(_cachePath);
        await JsonSerializer.SerializeAsync(stream, snapshot, SerializerOptions, ct);
    }
}
