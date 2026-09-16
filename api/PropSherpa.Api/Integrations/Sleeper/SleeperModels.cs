using System.Text.Json;

namespace PropSherpa.Api.Integrations.Sleeper;

/// <summary>
/// League settings. ScoringSettings stays as raw JSON values because leagues configure dozens of
/// scoring knobs and the lineup only reads a handful; modelling all of them to use six is waste.
/// </summary>
public record SleeperLeague(
    string LeagueId,
    string Name,
    string Season,
    string? Status,
    IReadOnlyList<string> RosterPositions,
    IReadOnlyDictionary<string, JsonElement>? ScoringSettings,
    IReadOnlyDictionary<string, JsonElement>? Settings);

public record SleeperUserMetadata(string? TeamName);

public record SleeperUser(string UserId, string? DisplayName, SleeperUserMetadata? Metadata)
{
    /// <summary>Sleeper only stores a team name when the manager set one.</summary>
    public string TeamName => Metadata?.TeamName is { Length: > 0 } name
        ? name
        : DisplayName ?? "Unknown team";
}

/// <summary>
/// One team's roster. Every collection is nullable - a league with no IR reports reserve as null
/// rather than an empty array.
/// </summary>
public record SleeperRoster(
    int RosterId,
    string? OwnerId,
    IReadOnlyList<string>? Players,
    IReadOnlyList<string>? Starters,
    IReadOnlyList<string>? Reserve,
    IReadOnlyList<string>? Taxi);

public record SleeperState(string Season, int Week, int DisplayWeek, string SeasonType);

/// <summary>One entry from the player directory, projected to the fields the lineup needs.</summary>
public record SleeperPlayer(
    string PlayerId,
    string? FullName,
    string? Team,
    string? Position,
    IReadOnlyList<string>? FantasyPositions,
    string? InjuryStatus,
    bool Active);

/// <summary>
/// Everything about a league that a lineup needs, fetched together and cached as a unit so the
/// page never waits on Sleeper.
/// </summary>
public record SleeperLeagueSnapshot(
    DateTimeOffset RetrievedAt,
    int Week,
    SleeperLeague League,
    IReadOnlyList<SleeperUser> Users,
    IReadOnlyList<SleeperRoster> Rosters);
