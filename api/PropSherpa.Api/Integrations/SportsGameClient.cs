using System.Text.Json;
using Microsoft.Extensions.Options;
using PropSherpa.Api.Features.Props;

namespace PropSherpa.Api.Integrations.SportsGameOdds;

public class SportsGameOddsClient : ISportsGameOddsClient
{
    private readonly HttpClient _httpClient;
    private readonly SportsGameOddsOptions _options;
    private readonly ILogger<SportsGameOddsClient> _logger;

    public SportsGameOddsClient(
        HttpClient httpClient,
        IOptions<SportsGameOddsOptions> options,
        ILogger<SportsGameOddsClient> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<string> GetSampleSportsJsonAsync(CancellationToken ct = default)
    {
        var response = await _httpClient.GetAsync("sports", ct);
        response.EnsureSuccessStatusCode();

        return await response.Content.ReadAsStringAsync(ct);
    }

    public async Task<PropSnapshot> FetchSnapshotAsync(int maxEvents, CancellationToken ct = default)
    {
        var url = $"events?leagueID={_options.LeagueId}&oddsAvailable=true&limit={maxEvents}";

        using var response = await _httpClient.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

        var root = doc.RootElement;

        // The provider reports quota-truncated responses in a "notice" field rather than failing.
        if (root.TryGetProperty("notice", out var notice) && notice.ValueKind == JsonValueKind.String)
        {
            _logger.LogWarning("SportsGameOdds notice: {Notice}", notice.GetString());
        }

        if (!root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidOperationException("Unexpected response: missing 'data' array.");
        }

        var players = new List<PlayerProps>();
        var books = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        var eventCount = 0;

        foreach (var evt in data.EnumerateArray())
        {
            eventCount++;
            players.AddRange(ParseEvent(evt, books));
        }

        return new PropSnapshot(
            RetrievedAt: DateTimeOffset.UtcNow,
            League: _options.LeagueId,
            EventCount: eventCount,
            Books: books.ToList(),
            Players: players);
    }

    public async Task<IReadOnlyDictionary<string, string>> FetchPositionsAsync(
        IReadOnlyList<string> playerIds, CancellationToken ct = default)
    {
        var positions = new Dictionary<string, string>();
        if (playerIds.Count == 0) return positions;

        // The provider accepts a comma-separated batch; 50 keeps the URL to a sane length.
        foreach (var batch in playerIds.Distinct().Chunk(50))
        {
            var url = $"players?playerID={string.Join(',', batch)}";

            using var response = await _httpClient.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Position lookup failed ({Status}); positions stay unknown.", response.StatusCode);
                continue;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

            if (!doc.RootElement.TryGetProperty("data", out var data)) continue;

            foreach (var player in data.EnumerateArray())
            {
                var id = GetString(player, "playerID");
                var position = GetString(player, "position");

                if (id is not null && position is not null) positions[id] = position;
            }
        }

        return positions;
    }

    private static IEnumerable<PlayerProps> ParseEvent(JsonElement evt, ISet<string> books)
    {
        if (!evt.TryGetProperty("odds", out var odds) || odds.ValueKind != JsonValueKind.Object)
        {
            yield break;
        }

        var eventId = evt.TryGetProperty("eventID", out var id) ? id.GetString() ?? "" : "";
        var kickoff = ReadKickoff(evt);
        var (homeTeam, awayTeam) = ReadTeams(evt);
        var playerNames = ReadPlayers(evt, out var playerTeams);

        // Group the flat odds map by player, keeping only the markets and side we care about.
        var byPlayer = new Dictionary<string, List<PropLine>>();

        foreach (var odd in odds.EnumerateObject())
        {
            var value = odd.Value;

            var statId = GetString(value, "statID");
            if (statId is null) continue;

            // Game-long lines only; quarter and half splits are noise for a start/sit call.
            if (GetString(value, "periodID") != "game") continue;

            var playerId = GetString(value, "playerID");
            if (string.IsNullOrEmpty(playerId)) continue;

            if (GetBool(value, "cancelled")) continue;

            var sideId = GetString(value, "sideID");
            var betTypeId = GetString(value, "betTypeID");

            // The 2+ markets are the over/under form of a stat we already track, read at the 1.5
            // line. They arrive in the same payload entry as the base market, so this pass can
            // emit both rows from one entry.
            var twoPlusId = PropMarkets.TwoPlusIdFor(statId);
            if (twoPlusId is not null && sideId == "over" && betTypeId == "ou")
            {
                var twoPlus = ReadTwoPlus(value, twoPlusId, books);
                if (twoPlus is not null)
                {
                    if (!byPlayer.TryGetValue(playerId, out var twoPlusLines))
                    {
                        byPlayer[playerId] = twoPlusLines = new List<PropLine>();
                    }

                    twoPlusLines.Add(twoPlus);
                }
            }

            if (!PropMarkets.Names.ContainsKey(statId)) continue;
            if (sideId != PropMarkets.SideFor(statId)) continue;
            if (betTypeId != PropMarkets.BetTypeFor(statId)) continue;

            var quotes = ReadBookQuotes(value, books);

            var consensusLine = GetString(value, "fairOverUnder");
            var consensusPrice = GetString(value, "fairOdds");

            // Lower API tiers strip per-book odds while still returning the consensus. Keeping a
            // market with no books but a fair line is better than dropping it silently.
            if (quotes.Count == 0 && consensusPrice is null) continue;

            var line = new PropLine(
                StatId: statId,
                Market: PropMarkets.DisplayName(statId),
                Side: PropMarkets.SideFor(statId),
                ConsensusLine: consensusLine,
                ConsensusPrice: consensusPrice,
                OpenPrice: GetString(value, "openBookOdds"),
                Books: quotes);

            if (!byPlayer.TryGetValue(playerId, out var lines))
            {
                byPlayer[playerId] = lines = new List<PropLine>();
            }

            lines.Add(line);
        }

        foreach (var (playerId, lines) in byPlayer)
        {
            var team = playerTeams.GetValueOrDefault(playerId, "");
            var opponent = team == homeTeam ? awayTeam : homeTeam;

            // Keep markets in catalog order so every player's row reads the same way.
            var ordered = lines
                .OrderBy(l => PropMarkets.All.ToList().IndexOf(l.StatId))
                .ToList();

            yield return new PlayerProps(
                PlayerId: playerId,
                Name: playerNames.GetValueOrDefault(playerId, playerId),
                Team: team,
                Opponent: opponent,
                EventId: eventId,
                Kickoff: kickoff,
                Lines: ordered);
        }
    }

    /// <summary>
    /// Builds a 2+ touchdown row from an over/under entry, keeping only book quotes posted at the
    /// 1.5 line.
    /// </summary>
    /// <remarks>
    /// This market gets no consensus price, deliberately. On anytime touchdowns the provider's
    /// fairOverUnder disagrees with every book on most players - it reports 0.5 while all books
    /// post 1.5 - and its fairOdds is the anytime price, which answers a different question than
    /// the 1.5 line it is attached to. Books also quote only the over side here, so there is no
    /// two-way market to de-vig locally. The honest result is book prices with the vig left in
    /// and no fair number invented.
    /// </remarks>
    private static PropLine? ReadTwoPlus(JsonElement odd, string twoPlusId, ISet<string> books)
    {
        var quotes = ReadBookQuotes(odd, books)
            .Where(quote => quote.Line == PropMarkets.TwoPlusLine)
            .ToList();

        if (quotes.Count == 0) return null;

        return new PropLine(
            StatId: twoPlusId,
            Market: PropMarkets.DisplayName(twoPlusId),
            Side: "over",
            ConsensusLine: PropMarkets.TwoPlusLine,
            ConsensusPrice: null,
            OpenPrice: null,
            Books: quotes);
    }

    private static List<BookQuote> ReadBookQuotes(JsonElement odd, ISet<string> books)
    {
        var quotes = new List<BookQuote>();

        if (!odd.TryGetProperty("byBookmaker", out var byBook) || byBook.ValueKind != JsonValueKind.Object)
        {
            return quotes;
        }

        foreach (var book in byBook.EnumerateObject())
        {
            // Inactive entries persist in the payload; they are stale, not current offers.
            if (!GetBool(book.Value, "available")) continue;

            books.Add(book.Name);

            quotes.Add(new BookQuote(
                Book: book.Name,
                Line: GetString(book.Value, "overUnder"),
                Price: GetString(book.Value, "odds"),
                LastUpdated: GetDate(book.Value, "lastUpdatedAt"),
                Deeplink: GetString(book.Value, "deeplink")));
        }

        return quotes.OrderBy(q => q.Book, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static Dictionary<string, string> ReadPlayers(JsonElement evt, out Dictionary<string, string> teams)
    {
        var names = new Dictionary<string, string>();
        teams = new Dictionary<string, string>();

        if (!evt.TryGetProperty("players", out var players) || players.ValueKind != JsonValueKind.Object)
        {
            return names;
        }

        foreach (var player in players.EnumerateObject())
        {
            var name = GetString(player.Value, "name");
            if (name is not null) names[player.Name] = name;

            var teamId = GetString(player.Value, "teamID");
            if (teamId is not null) teams[player.Name] = teamId;
        }

        return names;
    }

    private static (string Home, string Away) ReadTeams(JsonElement evt)
    {
        if (!evt.TryGetProperty("teams", out var teams) || teams.ValueKind != JsonValueKind.Object)
        {
            return ("", "");
        }

        return (ReadTeamId(teams, "home"), ReadTeamId(teams, "away"));
    }

    private static string ReadTeamId(JsonElement teams, string side) =>
        teams.TryGetProperty(side, out var team) ? GetString(team, "teamID") ?? "" : "";

    private static DateTimeOffset? ReadKickoff(JsonElement evt) =>
        evt.TryGetProperty("status", out var status) ? GetDate(status, "startsAt") : null;

    private static string? GetString(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static bool GetBool(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.True;

    private static DateTimeOffset? GetDate(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.String
        && DateTimeOffset.TryParse(value.GetString(), out var parsed)
            ? parsed
            : null;
}
