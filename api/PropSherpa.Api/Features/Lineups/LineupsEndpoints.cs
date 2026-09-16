using Microsoft.AspNetCore.Mvc;
using PropSherpa.Api.Integrations.Sleeper;

namespace PropSherpa.Api.Features.Lineups;

public static class LineupsEndpoints
{
    public static IEndpointRouteBuilder MapLineupsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/lineups");

        group.MapGet("/{leagueId}", async (
            string leagueId,
            int? rosterId,
            [FromServices] LineupBuilder builder,
            CancellationToken ct) =>
            await Run(async () =>
            {
                var lineup = await builder.BuildAsync(leagueId, rosterId, ct);

                return lineup is null ? EmptyCache() : Results.Ok(lineup);
            }))
        .WithName("GetLineup");

        // Rosters change on every waiver claim and lineup edit, so this is the refresh that matters
        // day to day. Four small requests.
        group.MapPost("/{leagueId}/refresh", async (
            string leagueId,
            [FromServices] SleeperLeagueCache leagues,
            CancellationToken ct) =>
            await Run(async () =>
            {
                var snapshot = await leagues.RefreshAsync(leagueId, ct);

                return Results.Ok(new
                {
                    snapshot.RetrievedAt,
                    snapshot.Week,
                    League = snapshot.League.Name,
                    Teams = snapshot.Rosters.Count,
                });
            }))
        .WithName("RefreshLeague");

        // The player directory is 15 MB, so this stays a deliberate act - needed only when a newly
        // signed player has no entry yet.
        group.MapPost("/players/refresh", async (
            [FromServices] SleeperPlayerDirectory directory,
            CancellationToken ct) =>
            await Run(async () =>
            {
                var players = await directory.RefreshAsync(ct);

                return Results.Ok(new { Players = players.Count, DownloadedAt = directory.LastDownloaded });
            }))
        .WithName("RefreshSleeperPlayers");

        group.MapGet("/{leagueId}/coverage", async (
            string leagueId,
            [FromServices] LineupBuilder builder,
            CancellationToken ct) =>
            await Run(async () =>
            {
                var coverage = await builder.BuildCoverageAsync(leagueId, ct);

                return coverage is null ? EmptyCache() : Results.Ok(coverage);
            }))
        .WithName("LineupCoverage");

        return app;
    }

    /// <summary>
    /// Turns a Sleeper failure into the same problem+json shape the rest of the API uses, so the
    /// client's existing error handling reads it without a special case.
    /// </summary>
    private static async Task<IResult> Run(Func<Task<IResult>> handler)
    {
        try
        {
            return await handler();
        }
        catch (HttpRequestException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return Results.Problem(
                title: "League not found",
                detail: "Sleeper does not recognise that league id.",
                statusCode: StatusCodes.Status404NotFound);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return Results.Problem(
                title: "Sleeper is unavailable",
                detail: "Could not reach Sleeper. Try again in a moment.",
                statusCode: StatusCodes.Status502BadGateway);
        }
    }

    private static IResult EmptyCache() => Results.Problem(
        title: "No cached odds yet",
        detail: "POST /api/props/refresh to pull a snapshot from the provider.",
        statusCode: StatusCodes.Status503ServiceUnavailable);
}
