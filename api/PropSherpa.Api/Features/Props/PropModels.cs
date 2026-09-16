namespace PropSherpa.Api.Features.Props;

/// <summary>
/// One sportsbook's offer on a single prop. Books frequently disagree on the LINE as well as
/// the price, so the two always travel together - a price without its line is not comparable.
/// </summary>
public record BookQuote(
    string Book,
    string? Line,
    string? Price,
    DateTimeOffset? LastUpdated,
    string? Deeplink);

/// <summary>
/// A single market for a single player (e.g. "receiving yards over"), with every book's
/// offer plus the de-vigged consensus published by the provider.
/// </summary>
public record PropLine(
    string StatId,
    string Market,
    string Side,
    string? ConsensusLine,
    string? ConsensusPrice,
    string? OpenPrice,
    IReadOnlyList<BookQuote> Books)
{
    /// <summary>
    /// A market the player's position calls for but no book has posted. Shown as an empty row,
    /// because "no line offered" is itself a signal about expected usage.
    /// </summary>
    public static PropLine Absent(string statId) => new(
        StatId: statId,
        Market: PropMarkets.DisplayName(statId),
        Side: PropMarkets.SideFor(statId),
        ConsensusLine: null,
        ConsensusPrice: null,
        OpenPrice: null,
        Books: Array.Empty<BookQuote>());
}

public record PlayerProps(
    string PlayerId,
    string Name,
    string Team,
    string Opponent,
    string EventId,
    DateTimeOffset? Kickoff,
    IReadOnlyList<PropLine> Lines)
{
    /// <summary>QB, RB, WR or TE. Null when the provider has not been asked yet.</summary>
    public string? Position { get; init; }
}

/// <summary>The cached snapshot. Written by a manual refresh, read by every query.</summary>
public record PropSnapshot(
    DateTimeOffset RetrievedAt,
    string League,
    int EventCount,
    IReadOnlyList<string> Books,
    IReadOnlyList<PlayerProps> Players);
