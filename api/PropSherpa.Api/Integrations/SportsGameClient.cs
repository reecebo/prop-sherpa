using Microsoft.Extensions.Options;

namespace PropSherpa.Api.Integrations.SportsGameOdds;

public class SportsGameOddsClient : ISportsGameOddsClient
{
    private readonly HttpClient _httpClient;
    private readonly SportsGameOddsOptions _options;

    public SportsGameOddsClient(HttpClient httpClient, IOptions<SportsGameOddsOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
    }

    public async Task<string> GetSampleSportsJsonAsync(CancellationToken ct = default)
    {
        // Simple test: call /sports to prove the key works
        var response = await _httpClient.GetAsync("sports", ct);
        response.EnsureSuccessStatusCode();

        return await response.Content.ReadAsStringAsync(ct);
    }
}
