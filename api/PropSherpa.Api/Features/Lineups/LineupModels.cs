using PropSherpa.Api.Features.Props;

namespace PropSherpa.Api.Features.Lineups;

/// <summary>Why a rostered player has no odds attached.</summary>
public static class UnmatchedReasons
{
    /// <summary>Found on the roster, but no book has posted a line for them.</summary>
    public const string NoProps = "no-props";

    /// <summary>Their Sleeper id is not in our player directory, which may need refreshing.</summary>
    public const string NotInDirectory = "not-in-directory";

    /// <summary>Several players share the name and nothing separates them.</summary>
    public const string Ambiguous = "ambiguous";
}

/// <summary>
/// A rostered player. <see cref="Props"/> is null whenever the books have not priced them, which
/// is normal rather than an error - about a quarter of a roster on a typical week.
/// </summary>
public record LineupPlayer(
    string SleeperId,
    string Name,
    string? Position,
    string? Team,
    string? InjuryStatus,
    PlayerProps? Props,
    string? Unmatched);

/// <summary>
/// One lineup slot. Slots repeat - RB, RB, FLEX, FLEX, FLEX - so identity is the index within the
/// starting lineup, never the slot name.
/// </summary>
public record LineupSlot(
    int Index,
    string Slot,
    string Label,
    LineupPlayer? Starter,
    /// <summary>Bench players this slot accepts. Ranking them is the client's job.</summary>
    IReadOnlyList<LineupPlayer> Candidates);

public record LineupTeamSummary(int RosterId, string TeamName, string Manager);

public record LineupTeam(
    int RosterId,
    string TeamName,
    string Manager,
    IReadOnlyList<LineupSlot> Slots,
    IReadOnlyList<LineupPlayer> Bench,
    IReadOnlyList<LineupPlayer> Reserve,
    IReadOnlyList<LineupPlayer> Taxi);

public record LineupLeague(
    string LeagueId,
    string Name,
    string Season,
    int Week,
    LeagueScoring Scoring,
    IReadOnlyList<string> StartingSlots,
    IReadOnlyList<LineupTeamSummary> Teams);

public record LineupResponse(
    LineupLeague League,
    LineupTeam Team,
    DateTimeOffset PropsRetrievedAt,
    DateTimeOffset RostersRetrievedAt,
    DateTimeOffset? PlayersRetrievedAt,
    IReadOnlyList<string> Books,
    /// <summary>Starters with no odds, as a coverage signal for the page header.</summary>
    int UnmatchedStarters);
