using System.Text.Json;
using Microsoft.Extensions.Options;

namespace PropSherpa.Api.Integrations.Sleeper;

/// <summary>
/// The Sleeper player directory, cached in memory and mirrored to disk.
///
/// The source payload is 15 MB for ~12,000 players, of which we keep seven fields - about 1.4 MB.
/// Sleeper asks for at most one download a day, so reads never hit the network: only an explicit
/// refresh or an expired cache does.
/// </summary>
public class SleeperPlayerDirectory
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly ISleeperClient _client;
    private readonly SleeperOptions _options;
    private readonly ILogger<SleeperPlayerDirectory> _logger;
    private readonly string _cachePath;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);

    private IReadOnlyDictionary<string, SleeperPlayer>? _players;

    public SleeperPlayerDirectory(
        ISleeperClient client,
        IOptions<SleeperOptions> options,
        IHostEnvironment environment,
        ILogger<SleeperPlayerDirectory> logger)
    {
        _client = client;
        _options = options.Value;
        _logger = logger;

        _cachePath = Path.IsPathRooted(_options.PlayerCachePath)
            ? _options.PlayerCachePath
            : Path.Combine(environment.ContentRootPath, _options.PlayerCachePath);
    }

    /// <summary>When the cache was last written, or null when it has never been downloaded.</summary>
    public DateTimeOffset? LastDownloaded =>
        File.Exists(_cachePath) ? File.GetLastWriteTimeUtc(_cachePath) : null;

    /// <summary>
    /// The directory, downloading only when the disk copy is missing or older than the configured
    /// age. Age comes from the file's timestamp rather than a field inside it, which cannot
    /// disagree with itself.
    /// </summary>
    public async Task<IReadOnlyDictionary<string, SleeperPlayer>> GetAsync(CancellationToken ct = default)
    {
        if (_players is not null) return _players;

        await _refreshLock.WaitAsync(ct);
        try
        {
            if (_players is not null) return _players;

            var cached = await LoadFromDiskAsync(ct);
            if (cached is not null && !IsStale) return _players = cached;

            // A stale copy still beats no copy if the download fails.
            try
            {
                return _players = await DownloadAsync(ct);
            }
            catch (Exception ex) when (cached is not null && ex is HttpRequestException or TaskCanceledException)
            {
                _logger.LogWarning(ex, "Could not refresh the player directory; using the cached copy.");
                return _players = cached;
            }
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    /// <summary>Downloads the directory regardless of age.</summary>
    public async Task<IReadOnlyDictionary<string, SleeperPlayer>> RefreshAsync(CancellationToken ct = default)
    {
        await _refreshLock.WaitAsync(ct);
        try
        {
            return _players = await DownloadAsync(ct);
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    private bool IsStale =>
        LastDownloaded is not { } written ||
        DateTimeOffset.UtcNow - written > TimeSpan.FromDays(_options.PlayerCacheMaxAgeDays);

    private async Task<IReadOnlyDictionary<string, SleeperPlayer>> DownloadAsync(CancellationToken ct)
    {
        var players = await _client.GetPlayersAsync(ct);
        await SaveToDiskAsync(players, ct);

        return players;
    }

    private async Task<IReadOnlyDictionary<string, SleeperPlayer>?> LoadFromDiskAsync(CancellationToken ct)
    {
        if (!File.Exists(_cachePath)) return null;

        try
        {
            await using var stream = File.OpenRead(_cachePath);
            return await JsonSerializer.DeserializeAsync<Dictionary<string, SleeperPlayer>>(
                stream, SerializerOptions, ct);
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            _logger.LogWarning(ex, "Could not read the player cache at {Path}; re-downloading.", _cachePath);
            return null;
        }
    }

    /// <summary>
    /// Writes to a temporary file and moves it into place. A 15 MB download interrupted midway
    /// would otherwise leave a truncated file that fails to parse on the next start.
    /// </summary>
    private async Task SaveToDiskAsync(IReadOnlyDictionary<string, SleeperPlayer> players, CancellationToken ct)
    {
        var directory = Path.GetDirectoryName(_cachePath);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);

        var temporaryPath = _cachePath + ".tmp";

        await using (var stream = File.Create(temporaryPath))
        {
            await JsonSerializer.SerializeAsync(stream, players, SerializerOptions, ct);
        }

        File.Move(temporaryPath, _cachePath, overwrite: true);
    }
}
