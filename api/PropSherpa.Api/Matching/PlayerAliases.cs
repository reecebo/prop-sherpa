namespace PropSherpa.Api.Matching;

/// <summary>
/// Players the two sources call different things, where no amount of normalizing will bridge the
/// gap - the books post a nickname the roster does not use.
///
/// Keys and values are already normalized, so an entry cannot be written in a form that
/// <see cref="PlayerNameKey"/> would then mangle.
/// </summary>
public static class PlayerAliases
{
    private static readonly Dictionary<string, string> ByNameKey = new(StringComparer.Ordinal)
    {
        // The books list Zonovan Knight by his nickname.
        ["bamknight"] = "zonovanknight",
    };

    /// <summary>The name key to search for, which is the input unless an alias overrides it.</summary>
    public static string Resolve(string nameKey) =>
        ByNameKey.TryGetValue(nameKey, out var alias) ? alias : nameKey;
}
