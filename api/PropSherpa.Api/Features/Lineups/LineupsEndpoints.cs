using Microsoft.AspNetCore.Mvc;
using PropSherpa.Api.Integrations.Sleeper;

namespace PropSherpa.Api.Features.Lineups;

public static class LineupsEndpoints
{
    public static IEndpointRouteBuilder MapLineupsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/lineups");

        // TEMPORARY (step 1): proves the client and both caches work before the slice exists.
        group.MapGet("/debug/{leagueId}", async (
            string leagueId,
            [FromServices] SleeperLeagueCache leagues,
            [FromServices] SleeperPlayerDirectory directory,
            CancellationToken ct) =>
        {
            var snapshot = await leagues.GetAsync(leagueId, ct);
            var players = await directory.GetAsync(ct);

            return Results.Ok(new
            {
                snapshot.RetrievedAt,
                snapshot.Week,
                League = snapshot.League.Name,
                snapshot.League.Season,
                Teams = snapshot.Rosters.Count,
                snapshot.League.RosterPositions,
                Players = players.Count,
                PlayersDownloaded = directory.LastDownloaded,
            });
        })
        .WithName("LineupsDebug");

        return app;
    }
}
