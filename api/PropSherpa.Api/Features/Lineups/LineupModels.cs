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
    string? Unmatched)
{
    /// <summary>Sleeper's own projection for the week, for contrast with ours.</summary>
    public double? SleeperPoints { get; init; }

    /// <summary>
    /// True when this bench player is in the lineup the manager set but not in the optimal one -
    /// the mirror of <see cref="LineupSlot.Upgraded"/>.
    /// </summary>
    public bool Benched { get; init; }

    /// <summary>The player who takes their place, paired the same way an upgrade is.</summary>
    public LineupPlayer? ReplacedBy { get; init; }

    /// <summary>
    /// Indices of the lineup slots this player could legally fill.
    ///
    /// Sent rather than derived so the client never has to reimplement slot eligibility - the rule
    /// lives in <see cref="RosterSlots"/> alone, and cannot drift into a second copy that
    /// disagrees about what a FLEX takes.
    /// </summary>
    public IReadOnlyList<int> EligibleSlots { get; init; } = [];
}

/// <summary>One slot of the optimal lineup.</summary>
public record LineupSlot(
    int Index,
    string Slot,
    string Label,
    /// <summary>The best player available for this slot.</summary>
    LineupPlayer? Starter,
    /// <summary>Everyone else eligible here, for the drawer's comparison.</summary>
    IReadOnlyList<LineupPlayer> Candidates)
{
    /// <summary>
    /// True when this slot's player is not in the lineup the manager actually set.
    ///
    /// Judged on who is in the lineup overall rather than slot by slot: a player who keeps starting
    /// but shifts from FLEX to WR has not been changed, and flagging him would be noise.
    /// </summary>
    public bool Upgraded { get; init; }

    /// <summary>
    /// The benched player this one displaces, when the swap can be attributed to a single player.
    /// Null when the optimal lineup rearranges more than it replaces.
    /// </summary>
    public LineupPlayer? Replaces { get; init; }
}

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
    /// <summary>Slots with no priced player available, as a coverage signal.</summary>
    int UnmatchedStarters);
