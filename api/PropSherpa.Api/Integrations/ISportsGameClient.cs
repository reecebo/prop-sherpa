namespace PropSherpa.Api.Integrations.SportsGameOdds;

public interface ISportsGameOddsClient
{
    Task<string> GetSampleSportsJsonAsync(CancellationToken ct = default);
}
