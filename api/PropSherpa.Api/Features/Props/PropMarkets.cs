namespace PropSherpa.Api.Features.Props;

/// <summary>
/// The markets we track, keyed by the provider's statID. These strings were verified against
/// GET /markets?leagueID=NFL - if the provider renames one, this is the only place to change.
/// </summary>
public static class PropMarkets
{
    public const string PassingYards = "passing_yards";
    public const string PassingTouchdowns = "passing_touchdowns";
    public const string RushingYards = "rushing_yards";
    /// <summary>
    /// Superseded by the 2+ touchdown markets: a rushing TD is already inside anytime TD, so it
    /// never contributed points. Kept as a constant only so existing caches parse cleanly.
    /// </summary>
    public const string RushingTouchdowns = "rushing_touchdowns";
    public const string ReceivingYards = "receiving_yards";
    public const string Receptions = "receiving_receptions";
    public const string AnytimeTouchdown = "touchdowns";

    /// <summary>
    /// Two-or-more touchdown markets. The provider has no separate statID for these - they are
    /// the over/under form of the same stat, which books post at a line of 1.5. We keep them
    /// under synthetic ids so a player can carry both the anytime and the 2+ row.
    /// </summary>
    public const string TwoPlusTouchdowns = "touchdowns_2plus";
    public const string TwoPlusPassingTouchdowns = "passing_touchdowns_2plus";

    /// <summary>The line that defines a "2+" bet: over 1.5 is two or more.</summary>
    public const string TwoPlusLine = "1.5";

    /// <summary>Synthetic 2+ ids mapped back to the provider statID they are derived from.</summary>
    public static readonly IReadOnlyDictionary<string, string> TwoPlusSource = new Dictionary<string, string>
    {
        [TwoPlusTouchdowns] = AnytimeTouchdown,
        [TwoPlusPassingTouchdowns] = PassingTouchdowns,
    };

    /// <summary>Display names, indexed by statID.</summary>
    public static readonly IReadOnlyDictionary<string, string> Names = new Dictionary<string, string>
    {
        [PassingYards] = "Passing Yards",
        [PassingTouchdowns] = "Passing TDs",
        [RushingYards] = "Rushing Yards",
        [ReceivingYards] = "Receiving Yards",
        [Receptions] = "Receptions",
        [AnytimeTouchdown] = "Anytime TD",
        [TwoPlusTouchdowns] = "2+ TD",
        [TwoPlusPassingTouchdowns] = "2+ Pass TD",
    };

    /// <summary>
    /// Anytime touchdown is a yes/no market; everything else is an over/under. We keep the
    /// "over" and "yes" sides, since those are the ones a start/sit decision turns on.
    /// </summary>
    public static readonly IReadOnlySet<string> YesNoMarkets = new HashSet<string> { AnytimeTouchdown };

    /// <summary>Every statID we pull. Ordered so tables read consistently.</summary>
    public static readonly IReadOnlyList<string> All = new[]
    {
        PassingYards, PassingTouchdowns, TwoPlusPassingTouchdowns, RushingYards,
        ReceivingYards, Receptions, AnytimeTouchdown, TwoPlusTouchdowns,
    };

    public static string SideFor(string statId) => YesNoMarkets.Contains(statId) ? "yes" : "over";

    /// <summary>
    /// Anytime TD is published twice - as a yes/no market and as an over-0.5 line - which are the
    /// same bet. Pinning the bet type keeps one row per market instead of two.
    /// </summary>
    public static string BetTypeFor(string statId) => YesNoMarkets.Contains(statId) ? "yn" : "ou";

    /// <summary>Reverse of <see cref="TwoPlusSource"/>: the 2+ id derived from a provider statID.</summary>
    private static readonly IReadOnlyDictionary<string, string> TwoPlusByStat =
        TwoPlusSource.ToDictionary(pair => pair.Value, pair => pair.Key);

    /// <summary>The 2+ market derived from this statID, or null when it has none.</summary>
    public static string? TwoPlusIdFor(string statId) =>
        TwoPlusByStat.TryGetValue(statId, out var id) ? id : null;

    /// <summary>True when this id is a synthetic 2+ market rather than a provider statID.</summary>
    public static bool IsTwoPlus(string statId) => TwoPlusSource.ContainsKey(statId);

    public static string DisplayName(string statId) =>
        Names.TryGetValue(statId, out var name) ? name : statId;

    /// <summary>
    /// The markets that matter for each position. A player is shown every market in their set,
    /// including ones the book has not posted - an absent line is itself information (a RB with
    /// no receiving line is not being used in the passing game).
    /// </summary>
    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> ByPosition =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["QB"] = new[] { PassingYards, PassingTouchdowns, TwoPlusPassingTouchdowns, RushingYards, AnytimeTouchdown, TwoPlusTouchdowns },
            ["RB"] = new[] { RushingYards, ReceivingYards, Receptions, AnytimeTouchdown, TwoPlusTouchdowns },
            ["WR"] = new[] { ReceivingYards, Receptions, AnytimeTouchdown },
            ["TE"] = new[] { ReceivingYards, Receptions, AnytimeTouchdown },
            // Fullbacks are used as receiving backs and are a real, if rare, fantasy start.
            ["FB"] = new[] { RushingYards, ReceivingYards, Receptions, AnytimeTouchdown },
        };

    /// <summary>
    /// Positions we have no market set for - defenders, linemen, and the occasional mislabelled
    /// player. They only ever draw anytime-TD action, so that is all we show.
    /// </summary>
    private static readonly IReadOnlyList<string> UnknownPositionMarkets = new[] { AnytimeTouchdown };

    /// <summary>Markets for a position, falling back to everything when the position is unknown.</summary>
    public static IReadOnlyList<string> ForPosition(string? position)
    {
        if (position is null) return All;

        return ByPosition.TryGetValue(position, out var markets) ? markets : UnknownPositionMarkets;
    }
}
