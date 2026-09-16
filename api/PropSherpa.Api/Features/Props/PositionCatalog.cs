using System.Text.Json;

namespace PropSherpa.Api.Features.Props;

/// <summary>
/// Player positions, cached separately from odds. Positions cost one entity per player to look
/// up and effectively never change, so they are fetched once and reused across odds refreshes.
/// </summary>
public class PositionCatalog
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    private readonly string _path;
    private readonly ILogger<PositionCatalog> _logger;
    private readonly SemaphoreSlim _lock = new(1, 1);

    private Dictionary<string, string>? _positions;

    public PositionCatalog(IHostEnvironment environment, ILogger<PositionCatalog> logger)
    {
        _path = Path.Combine(environment.ContentRootPath, "Cache", "positions.json");
        _logger = logger;
    }

    public async Task<IReadOnlyDictionary<string, string>> GetAsync(CancellationToken ct = default)
    {
        if (_positions is not null) return _positions;

        await _lock.WaitAsync(ct);
        try
        {
            return _positions ??= await LoadAsync(ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    /// <summary>Merges newly resolved positions into the catalog and persists them.</summary>
    public async Task MergeAsync(IReadOnlyDictionary<string, string> resolved, CancellationToken ct = default)
    {
        if (resolved.Count == 0) return;

        await _lock.WaitAsync(ct);
        try
        {
            var merged = await LoadAsync(ct);

            foreach (var (playerId, position) in resolved) merged[playerId] = position;

            _positions = merged;

            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            await using var stream = File.Create(_path);
            await JsonSerializer.SerializeAsync(stream, merged, SerializerOptions, ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    /// <summary>Which of these players we do not have a position for yet.</summary>
    public async Task<IReadOnlyList<string>> MissingAsync(IEnumerable<string> playerIds, CancellationToken ct = default)
    {
        var known = await GetAsync(ct);
        return playerIds.Where(id => !known.ContainsKey(id)).Distinct().ToList();
    }

    private async Task<Dictionary<string, string>> LoadAsync(CancellationToken ct)
    {
        if (!File.Exists(_path)) return new Dictionary<string, string>();

        try
        {
            await using var stream = File.OpenRead(_path);
            return await JsonSerializer.DeserializeAsync<Dictionary<string, string>>(stream, SerializerOptions, ct)
                   ?? new Dictionary<string, string>();
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            _logger.LogWarning(ex, "Could not read position cache at {Path}.", _path);
            return new Dictionary<string, string>();
        }
    }
}
