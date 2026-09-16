namespace PropSherpa.Api.Matching;

/// <summary>
/// Translates the odds provider's team slugs into the short codes Sleeper uses.
///
/// Spelled out rather than derived from the slug: "SAN_FRANCISCO_49ERS_NFL" is "SF" and
/// "JACKSONVILLE_JAGUARS_NFL" is "JAX", so any rule would need enough exceptions to be harder to
/// read than the table. Verified against every slug in a cached snapshot.
/// </summary>
public static class NflTeamCodes
{
    private static readonly Dictionary<string, string> BySlug = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ARIZONA_CARDINALS_NFL"] = "ARI",
        ["ATLANTA_FALCONS_NFL"] = "ATL",
        ["BALTIMORE_RAVENS_NFL"] = "BAL",
        ["BUFFALO_BILLS_NFL"] = "BUF",
        ["CAROLINA_PANTHERS_NFL"] = "CAR",
        ["CHICAGO_BEARS_NFL"] = "CHI",
        ["CINCINNATI_BENGALS_NFL"] = "CIN",
        ["CLEVELAND_BROWNS_NFL"] = "CLE",
        ["DALLAS_COWBOYS_NFL"] = "DAL",
        ["DENVER_BRONCOS_NFL"] = "DEN",
        ["DETROIT_LIONS_NFL"] = "DET",
        ["GREEN_BAY_PACKERS_NFL"] = "GB",
        ["HOUSTON_TEXANS_NFL"] = "HOU",
        ["INDIANAPOLIS_COLTS_NFL"] = "IND",
        ["JACKSONVILLE_JAGUARS_NFL"] = "JAX",
        ["KANSAS_CITY_CHIEFS_NFL"] = "KC",
        ["LAS_VEGAS_RAIDERS_NFL"] = "LV",
        ["LOS_ANGELES_CHARGERS_NFL"] = "LAC",
        ["LOS_ANGELES_RAMS_NFL"] = "LAR",
        ["MIAMI_DOLPHINS_NFL"] = "MIA",
        ["MINNESOTA_VIKINGS_NFL"] = "MIN",
        ["NEW_ENGLAND_PATRIOTS_NFL"] = "NE",
        ["NEW_ORLEANS_SAINTS_NFL"] = "NO",
        ["NEW_YORK_GIANTS_NFL"] = "NYG",
        ["NEW_YORK_JETS_NFL"] = "NYJ",
        ["PHILADELPHIA_EAGLES_NFL"] = "PHI",
        ["PITTSBURGH_STEELERS_NFL"] = "PIT",
        ["SAN_FRANCISCO_49ERS_NFL"] = "SF",
        ["SEATTLE_SEAHAWKS_NFL"] = "SEA",
        ["TAMPA_BAY_BUCCANEERS_NFL"] = "TB",
        ["TENNESSEE_TITANS_NFL"] = "TEN",
        ["WASHINGTON_COMMANDERS_NFL"] = "WAS",
    };

    /// <summary>
    /// The Sleeper code for a slug, or null when it is unrecognised. Null rather than a guess: the
    /// matcher treats a missing team as "no tiebreaker available" and carries on.
    /// </summary>
    public static string? FromOddsSlug(string? slug) =>
        slug is not null && BySlug.TryGetValue(slug, out var code) ? code : null;
}
