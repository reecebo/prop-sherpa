namespace PropSherpa.Api.Integrations.SportsGameOdds;

public class SportsGameOddsOptions
{
    public string BaseUrl { get; set; } = string.Empty;
    public string LeagueId { get; set; } = "NFL";
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>Where the cached snapshot is written. Relative paths resolve against the content root.</summary>
    public string CachePath { get; set; } = "Cache/props-cache.json";

    /// <summary>Max events pulled per refresh. Each event costs one API entity against the monthly quota.</summary>
    public int MaxEventsPerRefresh { get; set; } = 20;
}
