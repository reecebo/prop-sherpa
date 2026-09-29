using PropSherpa.Api.Features.Props;

namespace PropSherpa.Api.Features.Lineups;

/// <summary>
/// Projected fantasy points from a player's props, used only to rank players when choosing the
/// best lineup.
///
/// The browser does the projection that is actually displayed, including the uncertainty bands.
/// This is the ordering key for the optimizer: it needs to agree with the client on who is better,
/// not on the exact number.
///
/// Agreeing on the ordering is what forces the absent-market baselines below to be duplicated
/// here. Without them this side scored a running back on rushing alone while the client credited
/// his usual receiving work, and the two disagreed about who was better - which put the worse
/// player in the lineup, not merely a wrong label on the row.
/// </summary>
public static class LineupScorer
{
    /// <summary>Anytime-TD prices are probabilities, so they contribute their expected value.</summary>
    private const string AnytimeTouchdown = "touchdowns";

    /// <summary>
    /// Fallback values for a market the position calls for but no book posted.
    ///
    /// A missing line is not missing information - books decline to post receiving lines for
    /// low-usage players, so absence means low usage. These mirror ABSENT_BASELINE in
    /// projection.ts and must be changed together; the two sides disagreeing about a player's
    /// value is the one way this feature can seat the wrong starter silently.
    /// </summary>
    private static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<string, double>> AbsentBaselines =
        new Dictionary<string, IReadOnlyDictionary<string, double>>(StringComparer.OrdinalIgnoreCase)
        {
            ["WR"] = new Dictionary<string, double>
            {
                [PropMarkets.ReceivingYards] = 27.5,
                [PropMarkets.Receptions] = 2.5,
            },
            ["TE"] = new Dictionary<string, double>
            {
                [PropMarkets.ReceivingYards] = 11.8,
                [PropMarkets.Receptions] = 1.5,
            },
            ["RB"] = new Dictionary<string, double>
            {
                [PropMarkets.ReceivingYards] = 7.2,
                [PropMarkets.Receptions] = 1,
                [PropMarkets.RushingYards] = 38,
            },
            ["FB"] = new Dictionary<string, double>
            {
                [PropMarkets.ReceivingYards] = 7.2,
                [PropMarkets.Receptions] = 1,
                [PropMarkets.RushingYards] = 38,
            },
        };

    public static double? Points(PlayerProps? player, LeagueScoring scoring)
    {
        if (player is null) return null;

        var baselines = player.Position is not null
            && AbsentBaselines.TryGetValue(player.Position, out var found)
                ? found
                : null;

        double total = 0;
        var posted = false;

        foreach (var line in player.Lines)
        {
            // A market the books never posted falls back to the position's baseline, exactly as
            // the client does. Absent with no baseline - a quarterback's receiving line - stays
            // absent rather than being invented.
            var value = ValueOf(line);

            if (value is null)
            {
                if (baselines is null || !baselines.TryGetValue(line.StatId, out var fallback)) continue;
                value = fallback;
            }
            else
            {
                posted = true;
            }

            total += line.StatId switch
            {
                PropMarkets.PassingYards => value.Value * scoring.PassYd,
                PropMarkets.PassingTouchdowns => value.Value * scoring.PassTd,
                PropMarkets.RushingYards => value.Value * scoring.RushYd,
                PropMarkets.ReceivingYards => value.Value * scoring.RecYd,
                PropMarkets.Receptions => value.Value * ReceptionValue(player.Position, scoring),
                AnytimeTouchdown => value.Value * scoring.RecTd,
                PropMarkets.TwoPlusTouchdowns => value.Value * scoring.RecTd,
                _ => 0,
            };
        }

        // Nothing posted means nothing to claim - never a confident zero.
        return posted ? total : null;
    }

    private static double ReceptionValue(string? position, LeagueScoring scoring) =>
        scoring.Rec + (position == "TE" ? scoring.BonusRecTe ?? 0 : 0);

    /// <summary>
    /// The market's number: its line, or its price as a probability where the price is what
    /// carries the projection.
    ///
    /// The 2+ markets are posted at a fixed line of 1.5 - the threshold that defines the bet, the
    /// same for every player - so reading it as a projection would credit everyone with an
    /// invented 1.5 touchdowns. Their price is the only informative part.
    /// </summary>
    private static double? ValueOf(PropLine line)
    {
        if (PropMarkets.IsTwoPlus(line.StatId))
        {
            return ImpliedProbability(line.ConsensusPrice) ?? MedianBookProbability(line);
        }

        if (line.ConsensusLine is not null && double.TryParse(line.ConsensusLine, out var posted))
        {
            return posted;
        }

        return ImpliedProbability(line.ConsensusPrice);
    }

    /// <summary>
    /// The 2+ markets carry no de-vigged consensus price, so their probability has to come from
    /// the books with the margin still in it. The median across books is steadier than any one.
    /// </summary>
    private static double? MedianBookProbability(PropLine line)
    {
        var probabilities = line.Books
            .Select(book => ImpliedProbability(book.Price))
            .OfType<double>()
            .Order()
            .ToList();

        if (probabilities.Count == 0) return null;

        var middle = probabilities.Count / 2;

        return probabilities.Count % 2 == 0
            ? (probabilities[middle - 1] + probabilities[middle]) / 2
            : probabilities[middle];
    }

    private static double? ImpliedProbability(string? price)
    {
        if (price is null || !double.TryParse(price, out var value) || value == 0) return null;

        return value > 0 ? 100 / (value + 100) : -value / (-value + 100);
    }
}
