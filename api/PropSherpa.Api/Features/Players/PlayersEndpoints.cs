using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;

namespace PropSherpa.Api.Features.Players;

public static class PlayersEndpoints
{
    public static IEndpointRouteBuilder MapPlayersEndpoints(this IEndpointRouteBuilder app)
    {
        // Local “dummy database” for now
        var players = new List<PlayerDto>
        {
            new("justin-jefferson", "Justin Jefferson", "MIN", "WR"),
            new("jamar-chase", "Ja'Marr Chase", "CIN", "WR"),
            new("christian-mccaffrey", "Christian McCaffrey", "SF", "RB"),
            new("patrick-mahomes", "Patrick Mahomes", "KC", "QB")
        };

        var group = app.MapGroup("/api/players");

        group.MapGet("/search", (string query) =>
        {
            var matches = players
                .Where(p => p.Name.Contains(query, StringComparison.OrdinalIgnoreCase))
                .ToList();

            return matches;
        })
        .WithName("SearchPlayers");

        return app;
    }
}
