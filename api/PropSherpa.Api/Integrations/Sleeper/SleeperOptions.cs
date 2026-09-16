namespace PropSherpa.Api.Integrations.Sleeper;

public class SleeperOptions
{
    /// <summary>
    /// Trailing slash is required: relative request paths omit the leading slash, and without it
    /// Uri resolution drops the /v1 segment.
    /// </summary>
    public string BaseUrl { get; set; } = "https://api.sleeper.app/v1/";

    /// <summary>Pre-fills the league input so the page works before anyone types an id.</summary>
    public string DefaultLeagueId { get; set; } = string.Empty;

    public string PlayerCachePath { get; set; } = "Cache/sleeper-players.json";

    /// <summary>Where per-league roster snapshots are written, one file per league.</summary>
    public string LeagueCacheDirectory { get; set; } = "Cache";

    /// <summary>
    /// The player directory is 15 MB and is reference data, so it refreshes on a timer as well as
    /// on demand. Sleeper asks for at most one call a day; a week is well inside that.
    /// </summary>
    public int PlayerCacheMaxAgeDays { get; set; } = 7;
}
