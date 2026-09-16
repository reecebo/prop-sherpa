namespace PropSherpa.Api.Matching;

/// <summary>
/// A player as either source describes them. The odds provider and Sleeper both project into this,
/// so the matcher never learns either provider's shape.
/// </summary>
/// <param name="SourceId">The id in whichever source this came from, to look the player back up.</param>
/// <param name="TeamCode">Always a Sleeper-style code (DET, SF) - translation happens at the boundary.</param>
public record PlayerIdentity(string SourceId, string Name, string? TeamCode, string? Position)
{
    /// <summary>Distinguishes a current player from a retired one sharing their name.</summary>
    public bool Active { get; init; } = true;
}

public enum MatchConfidence
{
    /// <summary>Name and team agree.</summary>
    Exact,

    /// <summary>Name agrees but the team differs or is unknown - usually a recent transaction.</summary>
    NameOnly,
}

public record PlayerMatch(PlayerIdentity Target, MatchConfidence Confidence);
