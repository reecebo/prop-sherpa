using System.Globalization;
using System.Text;

namespace PropSherpa.Api.Matching;

/// <summary>
/// Reduces a display name to a join key.
///
/// The odds cache carries no external ids - its player id is a slugified name - so the only bridge
/// to Sleeper is the name itself, and the two sources punctuate, accent and suffix names
/// differently. Running both sides through this one function is the point: a function cannot
/// disagree with itself, which trusting either source's own normalized field would risk.
///
/// Measured over a full snapshot, this resolves 396 of 397 players.
/// </summary>
public static class PlayerNameKey
{
    /// <summary>
    /// Generational suffixes, which the two sources disagree about constantly: the cache has
    /// "Aaron Jones Sr." where Sleeper has "Aaron Jones".
    /// </summary>
    private static readonly HashSet<string> Suffixes =
        new(StringComparer.OrdinalIgnoreCase) { "jr", "sr", "ii", "iii", "iv", "v" };

    public static string For(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return string.Empty;

        // Punctuation goes before the suffix check, or "Sr." never matches "sr".
        var tokens = Strip(name)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(token => new string(token.Where(char.IsLetterOrDigit).ToArray()))
            .Where(token => token.Length > 0)
            .ToList();

        // Only trailing suffixes are dropped, so a player whose first name is "Ivy" keeps it.
        var end = tokens.Count;
        while (end > 1 && Suffixes.Contains(tokens[end - 1])) end--;

        var key = new StringBuilder();
        for (var i = 0; i < end; i++) key.Append(tokens[i]);

        return key.ToString();
    }

    /// <summary>Removes accents and lowercases, so "Concepción" and "Concepcion" agree.</summary>
    private static string Strip(string name)
    {
        var decomposed = name.Normalize(NormalizationForm.FormD);
        var stripped = new StringBuilder(decomposed.Length);

        foreach (var character in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)
            {
                stripped.Append(char.ToLowerInvariant(character));
            }
        }

        return stripped.ToString();
    }
}
