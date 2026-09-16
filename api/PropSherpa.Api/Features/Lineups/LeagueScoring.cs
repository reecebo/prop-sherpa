using System.Text.Json;

namespace PropSherpa.Api.Features.Lineups;

/// <summary>
/// A league's scoring rules, as points per unit.
///
/// Sent as real numbers rather than a "PPR / half / standard" label because that label only
/// captures receptions. A league with six-point passing touchdowns or a tight end bonus would
/// otherwise render confidently wrong totals, which is worse than failing outright - nothing
/// about the page would look broken.
/// </summary>
public record LeagueScoring(
    double PassYd,
    double PassTd,
    double RushYd,
    double RecYd,
    double Rec,
    double RushTd,
    double RecTd,
    double? BonusRecTe)
{
    /// <summary>
    /// What the app assumed before leagues could describe themselves: 25 yards a point passing,
    /// 10 rushing or receiving, four points a passing touchdown and six for the rest.
    /// </summary>
    public static readonly LeagueScoring Default = new(
        PassYd: 0.04,
        PassTd: 4,
        RushYd: 0.1,
        RecYd: 0.1,
        Rec: 0.5,
        RushTd: 6,
        RecTd: 6,
        BonusRecTe: null);

    public static LeagueScoring From(IReadOnlyDictionary<string, JsonElement>? settings)
    {
        if (settings is null) return Default;

        return new LeagueScoring(
            PassYd: Read(settings, "pass_yd") ?? Default.PassYd,
            PassTd: Read(settings, "pass_td") ?? Default.PassTd,
            RushYd: Read(settings, "rush_yd") ?? Default.RushYd,
            RecYd: Read(settings, "rec_yd") ?? Default.RecYd,
            Rec: Read(settings, "rec") ?? Default.Rec,
            RushTd: Read(settings, "rush_td") ?? Default.RushTd,
            RecTd: Read(settings, "rec_td") ?? Default.RecTd,
            BonusRecTe: Read(settings, "bonus_rec_te"));
    }

    private static double? Read(IReadOnlyDictionary<string, JsonElement> settings, string key) =>
        settings.TryGetValue(key, out var value) && value.ValueKind == JsonValueKind.Number
            ? value.GetDouble()
            : null;
}
