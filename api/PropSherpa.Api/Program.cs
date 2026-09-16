using Microsoft.Extensions.Options;
using PropSherpa.Api.Features.Lineups;
using PropSherpa.Api.Features.Odds;
using PropSherpa.Api.Features.Props;
using PropSherpa.Api.Integrations.Sleeper;
using PropSherpa.Api.Integrations.SportsGameOdds;
using PropSherpa.Api.Matching;

var builder = WebApplication.CreateBuilder(args);

var configuration = builder.Configuration;

builder.Services.Configure<SportsGameOddsOptions>(configuration.GetSection("SportsGameOdds"));

builder.Services.AddHttpClient<ISportsGameOddsClient, SportsGameOddsClient>((sp, client) =>
{
    var opts = sp.GetRequiredService<IOptions<SportsGameOddsOptions>>().Value;

    client.BaseAddress = new Uri(opts.BaseUrl);

    if (!string.IsNullOrWhiteSpace(opts.ApiKey))
    {
        client.DefaultRequestHeaders.Add("X-Api-Key", opts.ApiKey);
    }
});

builder.Services.Configure<SleeperOptions>(configuration.GetSection("Sleeper"));

builder.Services.AddHttpClient<ISleeperClient, SleeperClient>((sp, client) =>
{
    var opts = sp.GetRequiredService<IOptions<SleeperOptions>>().Value;

    client.BaseAddress = new Uri(opts.BaseUrl);

    // The player directory is ~15 MB, which the default 100 seconds can be tight for.
    client.Timeout = TimeSpan.FromMinutes(2);
});

builder.Services.AddSingleton<PositionCatalog>();
builder.Services.AddSingleton<PropCache>();
builder.Services.AddSingleton<SleeperPlayerDirectory>();
builder.Services.AddSingleton<SleeperLeagueCache>();
builder.Services.AddSingleton<IPlayerMatcher, PlayerMatcher>();
builder.Services.AddScoped<LineupBuilder>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("web", policy => policy
        .WithOrigins("http://localhost:5173")
        .AllowAnyHeader()
        .AllowAnyMethod());
});

builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("web");

app.MapOddsEndpoints();
app.MapPropsEndpoints();
app.MapLineupsEndpoints();

app.Run();
