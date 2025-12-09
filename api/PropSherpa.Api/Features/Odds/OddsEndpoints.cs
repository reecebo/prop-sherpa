using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using PropSherpa.Api.Integrations.SportsGameOdds;

namespace PropSherpa.Api.Features.Odds;

public static class OddsEndpoints
{
    public static IEndpointRouteBuilder MapOddsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/odds");

        // Just a test endpoint for now
        group.MapGet("/sample-sports", async (
        [FromServices] ISportsGameOddsClient client,  // 👈 tell ASP.NET this is DI
        CancellationToken ct) =>
    {
        var json = await client.GetSampleSportsJsonAsync(ct);
        return Results.Content(json, "application/json");
    });

        return app;
    }
}


