namespace PropSherpa.Api.Integrations.SportsGameOdds;

public class SportsGameOddsOptions
{
    public string BaseUrl { get; set; } = string.Empty;
    public string LeagueId { get; set; } = "NFL";
    public string ApiKey { get; set; } = string.Empty;
}
