using Microsoft.AspNetCore.Mvc;

namespace PropSherpa.Api.Features.Props;

public static class PropsEndpoints
{
    public static IEndpointRouteBuilder MapPropsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/props");

        // Pulling costs quota, so refreshing is always an explicit act.
        group.MapPost("/refresh", async ([FromServices] PropCache cache, CancellationToken ct) =>
        {
            var snapshot = await cache.RefreshAsync(ct);

            return Results.Ok(new
            {
                snapshot.RetrievedAt,
                snapshot.EventCount,
                Players = snapshot.Players.Count,
                snapshot.Books,
            });
        })
        .WithName("RefreshProps");

        group.MapGet("/status", async ([FromServices] PropCache cache, CancellationToken ct) =>
        {
            var snapshot = await cache.GetAsync(ct);

            return snapshot is null
                ? Results.Ok(new { cached = false })
                : Results.Ok(new
                {
                    cached = true,
                    snapshot.RetrievedAt,
                    snapshot.EventCount,
                    Players = snapshot.Players.Count,
                    snapshot.Books,
                });
        })
        .WithName("PropsStatus");

        group.MapGet("/search", async (
            string query,
            [FromServices] PropCache cache,
            CancellationToken ct) =>
        {
            var snapshot = await cache.GetAsync(ct);
            if (snapshot is null) return EmptyCache();

            if (string.IsNullOrWhiteSpace(query)) return Results.Ok(Array.Empty<object>());

            var matches = snapshot.Players
                .Where(p => p.Name.Contains(query, StringComparison.OrdinalIgnoreCase))
                .OrderBy(p => p.Name)
                .Take(20)
                .Select(p => new { p.PlayerId, p.Name, p.Team, p.Opponent, p.Kickoff, p.Position })
                .ToList();

            return Results.Ok(matches);
        })
        .WithName("SearchProps");

        // The comparison view: two or more players side by side, every book's line and price.
        group.MapGet("/compare", async (
            string players,
            [FromServices] PropCache cache,
            CancellationToken ct) =>
        {
            var snapshot = await cache.GetAsync(ct);
            if (snapshot is null) return EmptyCache();

            var ids = players
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList();

            if (ids.Count == 0)
            {
                return Results.BadRequest(new { error = "Provide at least one player id." });
            }

            var matched = ids
                .Select(id => snapshot.Players.FirstOrDefault(p =>
                    string.Equals(p.PlayerId, id, StringComparison.OrdinalIgnoreCase)))
                .Where(p => p is not null)
                .Select(p => p!)
                .ToList();

            var missing = ids.Where(id => !matched.Any(p =>
                string.Equals(p.PlayerId, id, StringComparison.OrdinalIgnoreCase))).ToList();

            return Results.Ok(new
            {
                snapshot.RetrievedAt,
                Books = snapshot.Books,
                Players = matched,
                Missing = missing,
            });
        })
        .WithName("CompareProps");

        return app;
    }

    private static IResult EmptyCache() => Results.Problem(
        title: "No cached odds yet",
        detail: "POST /api/props/refresh to pull a snapshot from the provider.",
        statusCode: StatusCodes.Status503ServiceUnavailable);
}
