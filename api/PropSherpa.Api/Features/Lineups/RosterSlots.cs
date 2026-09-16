namespace PropSherpa.Api.Features.Lineups;

/// <summary>
/// Sleeper's lineup slot vocabulary. Which positions a slot accepts is a league rule rather than a
/// provider detail, which is why it sits with the lineup and not with the Sleeper client.
/// </summary>
public static class RosterSlots
{
    /// <summary>Slots that hold players but are not in the lineup.</summary>
    private static readonly HashSet<string> NonStarting =
        new(StringComparer.OrdinalIgnoreCase) { "BN", "IR", "TAXI" };

    private static readonly IReadOnlyDictionary<string, string[]> FlexPositions =
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["FLEX"] = ["RB", "WR", "TE"],
            ["WRRB_FLEX"] = ["RB", "WR"],
            ["WRRB_WRT_FLEX"] = ["RB", "WR", "TE"],
            ["REC_FLEX"] = ["WR", "TE"],
            ["SUPER_FLEX"] = ["QB", "RB", "WR", "TE"],
            ["SUPERFLEX"] = ["QB", "RB", "WR", "TE"],
            ["IDP_FLEX"] = ["DL", "LB", "DB"],
        };

    private static readonly IReadOnlyDictionary<string, string> Labels =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["SUPER_FLEX"] = "SFLEX",
            ["SUPERFLEX"] = "SFLEX",
            ["WRRB_FLEX"] = "W/R",
            ["WRRB_WRT_FLEX"] = "FLEX",
            ["REC_FLEX"] = "W/T",
            ["IDP_FLEX"] = "IDP",
        };

    /// <summary>Whether a player of this position may fill this slot.</summary>
    public static bool Accepts(string slot, string? position)
    {
        if (string.IsNullOrWhiteSpace(position)) return false;

        return FlexPositions.TryGetValue(slot, out var eligible)
            ? eligible.Contains(position, StringComparer.OrdinalIgnoreCase)
            : string.Equals(slot, position, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// The lineup slots, with bench, IR and taxi removed. Sleeper lists these first and keeps the
    /// `starters` array in the same order, so the result stays index-aligned with it.
    /// </summary>
    public static IReadOnlyList<string> StartingSlots(IReadOnlyList<string>? rosterPositions) =>
        rosterPositions?.Where(slot => !NonStarting.Contains(slot)).ToList() ?? [];

    /// <summary>A short label for the UI, so the client never parses Sleeper's vocabulary.</summary>
    public static string DisplayName(string slot) =>
        Labels.TryGetValue(slot, out var label) ? label : slot.ToUpperInvariant();
}
